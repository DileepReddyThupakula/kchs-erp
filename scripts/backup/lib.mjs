// Shared pieces of the backup tools. Nothing here prints a password, a key or a connection string.
//  - everything is encrypted with a PUBLIC key while it is written; no unencrypted copy ever touches the disk
//  - encryption is done by Node itself (no OpenSSL needed, so it works the same on every Mac): a random AES-256-GCM key per file, locked with the
//    RSA-4096 PUBLIC key (OAEP); the data is cut in 1 MB authenticated pieces. Only the private key (kept offline, passphrase-protected) opens it.
import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import readline from "node:readline";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

export const HOME = os.homedir();
export const DEFAULT_DIR = path.join(HOME, "KCHS-Backups");
export const DEFAULT_KEYS = path.join(HOME, "KCHS-Backup-Keys");

export function config() {
  return {
    // production backups never mix with development ones: they go in a "production" sub-folder
    dir: path.join(process.env.BACKUP_DIR || DEFAULT_DIR, process.argv.includes("--production") ? "production" : ""),
    keep: Math.max(1, Number(process.env.BACKUP_KEEP || 8)),
    publicKey: process.env.BACKUP_PUBLIC_KEY || path.join(DEFAULT_KEYS, "public-key.pem"),
    privateKey: process.env.BACKUP_PRIVATE_KEY || "",
  };
}

export function die(msg) {
  console.error(`\nSTOP: ${msg}\n`);
  process.exit(1);
}

/** Kept so older callers still work: nothing external is needed any more. */
export function requireOpenssl() {}

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
  while (!done) await more();     // read to the very end: this is also what checks the last piece of the encrypted file
}

// ------------------------------------------------------------------ encryption (RSA-OAEP key wrap + chunked AES-256-GCM)
const MAGIC = Buffer.from("KCHSENC1");
const CHUNK = 1 << 20;
const u32 = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const chunkNonce = (prefix, i) => Buffer.concat([prefix, u32(i)]);
const chunkAad = (i, final) => Buffer.concat([u32(i), Buffer.from([final ? 1 : 0])]);   // the counter and the "last piece" mark are authenticated: no reordering, no cutting short

/** Writes an encrypted file piece by piece. Only encrypted bytes (to a .partial file, renamed at the end) ever reach the disk. */
export class EncryptedFile {
  constructor(finalPath, publicKeyFile) {
    this.final = finalPath; this.partial = finalPath + ".partial";
    fs.mkdirSync(path.dirname(finalPath), { recursive: true, mode: 0o700 });
    this.out = fs.createWriteStream(this.partial, { mode: 0o600 });
    this.hash = crypto.createHash("sha256");
    this.key = crypto.randomBytes(32);
    this.prefix = crypto.randomBytes(8);
    this.i = 0; this.pending = []; this.pendingBytes = 0;
    const wrapped = crypto.publicEncrypt({ key: fs.readFileSync(publicKeyFile), padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, this.key);
    const head = Buffer.from(JSON.stringify({ v: 1, alg: "RSA-OAEP-256+AES-256-GCM-chunked", chunk: CHUNK, key: wrapped.toString("base64"), nonce: this.prefix.toString("base64") }));
    this.raw(Buffer.concat([MAGIC, u32(head.length), head]));
  }
  raw(buf) { this.hash.update(buf); return this.out.write(buf) ? null : new Promise((r) => this.out.once("drain", r)); }
  async seal(plain, final) {
    const c = crypto.createCipheriv("aes-256-gcm", this.key, chunkNonce(this.prefix, this.i));
    c.setAAD(chunkAad(this.i, final));
    const ct = Buffer.concat([c.update(plain), c.final()]);
    this.i++;
    await this.raw(Buffer.concat([u32(ct.length), ct, c.getAuthTag()]));
  }
  async write(buf) {
    this.pending.push(buf); this.pendingBytes += buf.length;
    while (this.pendingBytes >= CHUNK + 1) {          // always keep at least one byte back, so the last piece can be marked final
      const all = Buffer.concat(this.pending);
      await this.seal(all.subarray(0, CHUNK), false);
      const rest = all.subarray(CHUNK); this.pending = [rest]; this.pendingBytes = rest.length;
    }
  }
  async entry(name, buf) { await this.write(tarHeader(name, buf.length)); await this.write(buf); await this.write(pad(buf.length)); }
  async finish() {
    await this.write(TAR_END);
    await this.seal(Buffer.concat(this.pending), true);
    await new Promise((res, rej) => { this.out.on("error", rej); this.out.end(res); });
    fs.renameSync(this.partial, this.final);
    const sha = this.hash.digest("hex");
    fs.writeFileSync(this.final + ".sha256", `${sha}  ${path.basename(this.final)}\n`, { mode: 0o600 });
    return { path: this.final, bytes: fs.statSync(this.final).size, sha256: sha };
  }
  abort() { try { this.out.destroy(); } catch {} fs.rmSync(this.partial, { force: true }); }
}

// ------------------------------------------------------------------ private key (passphrase-protected) and decryption
/** Asks for a secret on the keyboard without showing it. BACKUP_KEY_PASSPHRASE is only for automatic tests. */
export async function askSecret(prompt) {
  if (process.env.BACKUP_KEY_PASSPHRASE) return process.env.BACKUP_KEY_PASSPHRASE;
  if (!process.stdin.isTTY) die("A passphrase is needed, and this is not an interactive Terminal.");
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  rl._writeToOutput = (t) => { if (t.includes(prompt)) process.stdout.write(t); };   // hide what is typed
  const a = await new Promise((r) => rl.question(prompt, r));
  rl.close(); process.stdout.write("\n");
  return a;
}

const SCRYPT = { N: 1 << 17, r: 8, p: 1, maxmem: 512 * 1024 * 1024 };
/** The private key file: the RSA key, locked with AES-256-GCM under a key made from the passphrase with scrypt (slow on purpose). */
export function lockPrivateKey(pkcs8Der, passphrase) {
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const k = crypto.scryptSync(passphrase, salt, 32, SCRYPT);
  const c = crypto.createCipheriv("aes-256-gcm", k, iv);
  const ct = Buffer.concat([c.update(pkcs8Der), c.final()]);
  return JSON.stringify({ kchs: "private-key", v: 1, kdf: "scrypt", N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p, salt: salt.toString("base64"), iv: iv.toString("base64"), tag: c.getAuthTag().toString("base64"), key: ct.toString("base64") }, null, 2) + "\n";
}
export function unlockPrivateKey(fileText, passphrase) {
  let j; try { j = JSON.parse(fileText); } catch { throw new Error("That is not a KCHS private key file."); }
  if (j.kchs !== "private-key") throw new Error("That is not a KCHS private key file.");
  try {
    const k = crypto.scryptSync(passphrase, Buffer.from(j.salt, "base64"), 32, { N: j.N, r: j.r, p: j.p, maxmem: SCRYPT.maxmem });
    const d = crypto.createDecipheriv("aes-256-gcm", k, Buffer.from(j.iv, "base64"));
    d.setAuthTag(Buffer.from(j.tag, "base64"));
    return crypto.createPrivateKey({ key: Buffer.concat([d.update(Buffer.from(j.key, "base64")), d.final()]), format: "der", type: "pkcs8" });
  } catch { throw new Error("Wrong passphrase, or the key file is damaged."); }
}

/** Opens an encrypted backup. Returns { stdout: Readable of the tar stream, on("close", cb(code)) }, like a child process, so callers stay simple. */
export function decrypt(file, privateKeyFile) {
  const ev = new EventEmitter();
  let key = null;
  const gen = async function* () {
    const pass = await askSecret("Passphrase of the private key: ");
    key = unlockPrivateKey(fs.readFileSync(privateKeyFile, "utf8"), pass);
    const fd = await fs.promises.open(file, "r");
    try {
      let pos = 0;
      const read = async (n) => { const b = Buffer.alloc(n); const { bytesRead } = await fd.read(b, 0, n, pos); pos += bytesRead; return b.subarray(0, bytesRead); };
      const size = (await fd.stat()).size;
      const m = await read(8);
      if (!m.equals(MAGIC)) throw new Error("This is not a KCHS backup file (or it is damaged).");
      const hl = (await read(4)).readUInt32BE();
      const head = JSON.parse((await read(hl)).toString());
      const aes = crypto.privateDecrypt({ key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" }, Buffer.from(head.key, "base64"));
      const prefix = Buffer.from(head.nonce, "base64");
      for (let i = 0; ; i++) {
        const len = (await read(4)).readUInt32BE();
        const body = await read(len + 16);
        if (body.length !== len + 16) throw new Error("The backup file is cut short (damaged).");
        const final = pos >= size;
        const d = crypto.createDecipheriv("aes-256-gcm", aes, chunkNonce(prefix, i));
        d.setAAD(chunkAad(i, final)); d.setAuthTag(body.subarray(len));
        try { yield Buffer.concat([d.update(body.subarray(0, len)), d.final()]); } catch { throw new Error("The backup is damaged or has been changed: it does not pass its safety check."); }
        if (final) break;
      }
    } finally { await fd.close(); }
  };
  const stdout = Readable.from(gen());
  let code = null;                       // remembered, so "close" can be asked for after the stream has already ended
  stdout.on("end", () => { code = 0; ev.emit("close", 0); });
  stdout.on("error", (e) => { console.error("\nSTOP: " + e.message); code = 1; ev.emit("close", 1); });
  return { stdout, on: (n, cb) => { if (n === "close" && code !== null) setImmediate(() => cb(code)); else ev.on(n, cb); } };
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
