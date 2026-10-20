// Shared pieces of the backup tools. Nothing here prints a password, a key or a connection string.
//  - everything is encrypted with a PUBLIC key while it is written; no unencrypted copy ever touches the disk
//  - encryption is OpenSSL "cms" (public-key, AES-256-GCM, authenticated): only the private key, kept offline, can open it
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export const HOME = os.homedir();
export const DEFAULT_DIR = path.join(HOME, "KCHS-Backups");
export const DEFAULT_KEYS = path.join(HOME, "KCHS-Backup-Keys");

export function config() {
  return {
    dir: process.env.BACKUP_DIR || DEFAULT_DIR,
    keep: Math.max(1, Number(process.env.BACKUP_KEEP || 8)),
    publicKey: process.env.BACKUP_PUBLIC_KEY || path.join(DEFAULT_KEYS, "public-key.pem"),
    privateKey: process.env.BACKUP_PRIVATE_KEY || "",
  };
}

export function die(msg) {
  console.error(`\nSTOP: ${msg}\n`);
  process.exit(1);
}

export function requireOpenssl() {
  const r = spawnSync("openssl", ["version"], { encoding: "utf8" });
  if (r.error || !/OpenSSL 3/.test(r.stdout)) die("OpenSSL 3 is needed. Install it with:  brew install openssl   (then open a new Terminal window).");
}

export function requirePublicKey(cfg) {
  if (!fs.existsSync(cfg.publicKey)) die(`The public key was not found at ${cfg.publicKey}.\nCreate your key pair first:  npm run backup:keygen   (see docs/BACKUP.md, step 1).`);
  const t = fs.readFileSync(cfg.publicKey, "utf8");
  if (/PRIVATE KEY/.test(t)) die("That file contains a PRIVATE key. Point BACKUP_PUBLIC_KEY at the public file only.");
}

/** libpq environment from a connection string, so the password never appears in a command line or a log. */
export function dbEnv(url) {
  let u;
  try { u = new URL(url); } catch { die("DATABASE_URL in .env.local is not a valid connection string."); }
  return {
    ...process.env,
    PGHOST: u.hostname, PGPORT: u.port || "5432", PGUSER: decodeURIComponent(u.username), PGPASSWORD: decodeURIComponent(u.password),
    PGDATABASE: decodeURIComponent(u.pathname.replace(/^\//, "")) || "postgres", PGSSLMODE: process.env.PGSSLMODE || "require",
  };
}

export const stamp = (d = new Date()) => d.toISOString().slice(0, 10) + "_" + d.toISOString().slice(11, 16).replace(":", "");

// ------------------------------------------------------------------ tar (ustar) writer
function octal(n, len) { return n.toString(8).padStart(len - 1, "0") + "\0"; }
export function tarHeader(name, size, mtime = new Date()) {
  let prefix = "";
  let base = name;
  if (Buffer.byteLength(name) > 100) {
    const cut = name.lastIndexOf("/", 155);
    if (cut <= 0 || Buffer.byteLength(name.slice(cut + 1)) > 100) throw new Error("file name too long for the archive");
    prefix = name.slice(0, cut); base = name.slice(cut + 1);
  }
  const h = Buffer.alloc(512);
  h.write(base, 0, 100); h.write(octal(0o600, 8), 100); h.write(octal(0, 8), 108); h.write(octal(0, 8), 116);
  h.write(octal(size, 12), 124); h.write(octal(Math.floor(mtime.getTime() / 1000), 12), 136);
  h.write("        ", 148); h.write("0", 156); h.write("ustar\0", 257); h.write("00", 263); h.write(prefix, 345, 155);
  let sum = 0; for (const b of h) sum += b;
  h.write(octal(sum, 7) + " ", 148);
  return h;
}
const pad = (size) => Buffer.alloc((512 - (size % 512)) % 512);
export const TAR_END = Buffer.alloc(1024);

/** Reads a tar stream; calls onEntry(name, size, async iterator of chunks) for each file. */
export async function readTar(readable, onEntry) {
  let buf = Buffer.alloc(0);
  const it = readable[Symbol.asyncIterator]();
  let done = false;
  const more = async () => { const n = await it.next(); if (n.done) { done = true; return false; } buf = Buffer.concat([buf, n.value]); return true; };
  const need = async (n) => { while (buf.length < n && !done) await more(); return buf.length >= n; };
  while (await need(512)) {
    const h = buf.subarray(0, 512);
    if (h.every((b) => b === 0)) break;
    const str = (a, l) => h.toString("utf8", a, a + l).replace(/\0.*$/s, "");
    const name = (str(345, 155) ? str(345, 155) + "/" : "") + str(0, 100);
    const size = parseInt(str(124, 12).trim() || "0", 8);
    buf = buf.subarray(512);
    let left = size;
    const chunks = (async function* () {
      while (left > 0) {
        if (!buf.length && !(await more())) throw new Error("the archive ends too early (damaged file)");
        const take = Math.min(left, buf.length);
        yield buf.subarray(0, take); buf = buf.subarray(take); left -= take;
      }
    })();
    await onEntry(name, size, chunks);
    for await (const _ of chunks) { /* drain what the callback did not read */ }
    const p = pad(size).length;
    await need(p); buf = buf.subarray(p);
  }
}

// ------------------------------------------------------------------ encrypted output
/** A writer whose bytes go straight into `openssl cms -encrypt` and from there into a .partial file; finish() renames it. */
export class EncryptedFile {
  constructor(finalPath, publicKey) {
    this.final = finalPath; this.partial = finalPath + ".partial";
    fs.mkdirSync(path.dirname(finalPath), { recursive: true, mode: 0o700 });
    this.out = fs.createWriteStream(this.partial, { mode: 0o600 });
    this.hash = crypto.createHash("sha256");
    this.proc = spawn("openssl", ["cms", "-encrypt", "-binary", "-stream", "-aes-256-gcm", "-outform", "DER", "-recip", publicKey], { stdio: ["pipe", "pipe", "pipe"] });
    this.err = ""; this.proc.stderr.on("data", (d) => (this.err += d));
    this.proc.stdout.on("data", (d) => this.hash.update(d));
    this.proc.stdout.pipe(this.out);
    this.closed = new Promise((res) => this.out.on("close", res));
    this.exited = new Promise((res) => this.proc.on("close", res));
    this.proc.stdin.on("error", () => {});
  }
  async write(buf) { if (!this.proc.stdin.write(buf)) await new Promise((r) => this.proc.stdin.once("drain", r)); }
  async entry(name, buf) { await this.write(tarHeader(name, buf.length)); await this.write(buf); await this.write(pad(buf.length)); }
  async finish() {
    await this.write(TAR_END);
    this.proc.stdin.end();
    const code = await this.exited; await this.closed;
    if (code !== 0) { this.abort(); throw new Error("encryption failed: " + this.err.trim().slice(0, 300)); }
    fs.renameSync(this.partial, this.final);
    const sha = this.hash.digest("hex");
    fs.writeFileSync(this.final + ".sha256", `${sha}  ${path.basename(this.final)}\n`, { mode: 0o600 });
    return { path: this.final, bytes: fs.statSync(this.final).size, sha256: sha };
  }
  abort() { try { this.proc.kill(); } catch {} try { this.out.destroy(); } catch {} fs.rmSync(this.partial, { force: true }); }
}

// ------------------------------------------------------------------ decrypt (restore side)
/** Starts `openssl cms -decrypt`; returns the process (stdout = the tar stream). The private key passphrase is asked on the keyboard. */
export function decrypt(file, privateKey, publicKey) {
  const args = ["cms", "-decrypt", "-inform", "DER", "-in", file, "-inkey", privateKey, "-recip", publicKey];
  if (process.env.BACKUP_KEY_PASSPHRASE) args.push("-passin", "env:BACKUP_KEY_PASSPHRASE");
  return spawn("openssl", args, { stdio: ["inherit", "pipe", "inherit"] });
}

// ------------------------------------------------------------------ housekeeping
export function listBackups(dir, kind) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => new RegExp(`^kchs-${kind}-.*\\.enc$`).test(f)).sort();
}
/** Keeps the newest `keep` backups of one kind, deletes the older ones (and their .sha256). Returns what was deleted. */
export function rotate(dir, kind, keep) {
  const all = listBackups(dir, kind);
  const old = all.slice(0, Math.max(0, all.length - keep));
  for (const f of old) { fs.rmSync(path.join(dir, f), { force: true }); fs.rmSync(path.join(dir, f + ".sha256"), { force: true }); }
  return old;
}
export const mb = (n) => (n / 1048576).toFixed(1) + " MB";
export function loadEnvHint() {
  if (!process.env.DATABASE_URL) die("DATABASE_URL is missing. Run this with:  npm run <name>   (it reads .env.local), and check that .env.local has DATABASE_URL.");
}
