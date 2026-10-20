// npm run restore:db  -- <backup file> --target "<connection string of the NEW database>" --key <private-key.pem>
// npm run restore:files -- <archive file> --key <private-key.pem>      (uploads into the project named by TARGET_SUPABASE_URL + TARGET_SERVICE_KEY)
// Restoring is for a NEW or EMPTY project. It refuses the live database unless you add --allow-live (disaster recovery only; read docs/BACKUP.md first).
import fs from "node:fs";
import readline from "node:readline/promises";
import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config, dbEnv, decrypt, die, readTar, requireOpenssl } from "./lib.mjs";
import { readDbBackup, restoreDb } from "./restore-lib.mjs";

requireOpenssl();
const [mode, ...rest] = process.argv.slice(2);
const flag = (n) => { const i = rest.indexOf(n); return i >= 0 ? rest[i + 1] : undefined; };
const file = rest.find((a) => !a.startsWith("--") && fs.existsSync(a));
const cfg = config();
const privateKey = flag("--key") || cfg.privateKey;
if (!["db", "files"].includes(mode) || !file) die("Usage: npm run restore:db -- <backup file> --target \"<new database url>\" --key <private-key.pem>\n       npm run restore:files -- <archive file> --key <private-key.pem>");
if (!privateKey || !fs.existsSync(privateKey)) die("Give the private key file with  --key /path/to/private-key.pem  (the passphrase is asked next).");
if (!fs.existsSync(cfg.publicKey)) die(`The public key file is needed too (${cfg.publicKey}); set BACKUP_PUBLIC_KEY.`);
const ask = async (q) => { const rl = readline.createInterface({ input: process.stdin, output: process.stdout }); const a = await rl.question(q); rl.close(); return a.trim(); };

if (mode === "db") {
  const target = flag("--target");
  if (!target) die("Add  --target \"<connection string of the NEW database>\"");
  const env = dbEnv(target);
  const live = process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : "";
  if (env.PGHOST === live && !rest.includes("--allow-live")) die("That is the LIVE database. A restore overwrites what is there. Restore into a NEW project, or add --allow-live if you are sure (docs/BACKUP.md, 'If data is lost').");
  if ((await ask(`Restore ${file}\ninto ${env.PGHOST}? Type RESTORE to continue: `)) !== "RESTORE") die("Cancelled. Nothing was changed.");
  console.log("Opening the backup (you may be asked for the passphrase)…");
  const parts = await readDbBackup(file, privateKey, cfg.publicKey);
  console.log(`Backup made ${parts.manifest.createdAt}. Restoring…`);
  const log = await restoreDb(parts, env, { scratch: false });
  for (const l of log) console.log(`  ${l.code === 0 ? "ok     " : "WARNING"} ${l.step}${l.errors.length ? ` (${l.errors.length} message(s), first: ${l.errors[0].slice(0, 160)})` : ""}`);
  console.log("\nThen: check the counts with the restore drill steps in docs/BACKUP.md, upload the files (npm run restore:files), and re-do the dashboard settings listed there.");
} else {
  const url = process.env.TARGET_SUPABASE_URL, key = process.env.TARGET_SERVICE_KEY;
  if (!url || !key) die("Set TARGET_SUPABASE_URL and TARGET_SERVICE_KEY (of the NEW project) in the Terminal first. See docs/BACKUP.md.");
  const prefix = flag("--prefix") ?? "";          // for tests only: upload into buckets named <prefix><bucket>
  const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const p = decrypt(file, privateKey, cfg.publicKey);
  const made = new Set(); let n = 0, bad = 0;
  await readTar(p.stdout, async (name, _size, chunks) => {
    if (!name.startsWith("files/")) { for await (const _ of chunks) {} return; }
    const [, bucket, ...path] = name.split("/");
    const buf = Buffer.concat(await (async () => { const o = []; for await (const c of chunks) o.push(c); return o; })());
    const target = prefix + bucket;
    if (!made.has(target)) { await sb.storage.createBucket(target, { public: bucket === "branding" }).catch(() => {}); made.add(target); }
    const { error } = await sb.storage.from(target).upload(path.join("/"), buf, { upsert: true });
    if (error) { bad++; console.error(`  could not upload one file in ${bucket}`); } else n++;
    void crypto;
  });
  console.log(`Uploaded ${n} file(s)${bad ? `, ${bad} FAILED` : ""}.`);
  if (bad) process.exit(1);
}
