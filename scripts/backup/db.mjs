// npm run backup:db : one encrypted file with the school's data (tables, login accounts, file list).
// Runs on YOUR Mac. Reads DATABASE_URL from .env.local (never printed). Writes only an encrypted file.
import { spawn } from "node:child_process";
import path from "node:path";
import pg from "pg";
import { useTarget } from "../lib/prod-guard.mjs";
import { config, dbEnv, die, EncryptedFile, loadEnvHint, mb, requireOpenssl, requirePublicKey, rotate, stamp } from "./lib.mjs";

await useTarget("backup:db", { confirm: false });   // development unless you add --production on purpose
const cfg = config();
loadEnvHint();
requireOpenssl();
requirePublicKey(cfg);
const env = dbEnv(process.env.DATABASE_URL);

function dump(args) {
  return new Promise((resolve, reject) => {
    const p = spawn("pg_dump", ["-Fc", "--no-owner", ...args], { env, stdio: ["ignore", "pipe", "pipe"] });
    const out = []; let err = "";
    p.stdout.on("data", (d) => out.push(d)); p.stderr.on("data", (d) => (err += d));
    p.on("error", () => reject(new Error("pg_dump is not installed. Install it with:  brew install libpq   or   brew install postgresql@17")));
    p.on("close", (c) => (c === 0 ? resolve(Buffer.concat(out)) : reject(new Error("pg_dump failed: " + err.trim().split("\n").slice(-3).join(" ").replace(/postgres(ql)?:\/\/\S+/g, "…")))));
  });
}

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
let snapshot = null;
const counts = {};
try {
  // one consistent picture: the counts and the dumps all see the database as it was at the same moment
  await client.query("begin isolation level repeatable read read only");
  snapshot = (await client.query("select pg_export_snapshot() s")).rows[0].s;
  const t = (await client.query("select table_schema s, table_name t from information_schema.tables where table_type = 'BASE TABLE' and table_schema in ('public','app') union all select 'auth','users' union all select 'auth','identities' union all select 'storage','buckets' union all select 'storage','objects' order by 1, 2")).rows;
  for (const r of t) counts[`${r.s}.${r.t}`] = Number((await client.query(`select count(*) from "${r.s}"."${r.t}"`)).rows[0].count);
  const info = (await client.query("select version() v, (select count(*) from pg_policies where schemaname = 'public') policies, (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','app')) functions, (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity) rls, (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')) anon_fns, (select count(*) from pg_policies where schemaname = 'storage') storage_policies")).rows[0];
  const snap = ["--snapshot=" + snapshot];
  const SAVE = ["-t", "auth.users", "-t", "auth.identities", "-t", "storage.buckets", "-t", "storage.objects"];
  console.log("Reading the database…");
  const app = await dump(["-n", "public", "-n", "app", ...snap]);
  const data = await dump(["--data-only", ...SAVE, ...snap]);
  const shape = await dump(["--schema-only", ...SAVE, ...snap]);
  await client.query("commit");

  const name = `kchs-db-${stamp()}.enc`;
  const file = new EncryptedFile(path.join(cfg.dir, name), cfg.publicKey);
  try {
    await file.entry("manifest.json", Buffer.from(JSON.stringify({ format: 1, kind: "db", createdAt: new Date().toISOString(), server: info.v.split(",")[0], policies: Number(info.policies), functions: Number(info.functions), rls_tables: Number(info.rls), anon_functions: Number(info.anon_fns), storage_policies: Number(info.storage_policies), counts }, null, 2)));
    await file.entry("app.dump", app);              // public + app schemas: structure, data, functions, policies, grants
    await file.entry("auth-storage-data.dump", data); // login accounts (with password hashes) + the list of stored files
    await file.entry("auth-storage-shape.dump", shape); // structure + storage policies of those tables (for scratch restores)
    await file.entry("README.txt", Buffer.from("KCHS school database backup. Open it only with the private key (docs/BACKUP.md). Restore: npm run restore:db -- <this file> --target <new database url>\n"));
    const done = await file.finish();
    const gone = rotate(cfg.dir, "db", cfg.keep);
    console.log(`\nDone: ${done.path}\n  size ${mb(done.bytes)} · ${Object.keys(counts).length} tables · ${counts["auth.users"]} login accounts · ${counts["storage.objects"]} stored files listed`);
    if (gone.length) console.log(`  removed ${gone.length} older backup(s); keeping the newest ${cfg.keep}`);
    console.log(`\nCopy the folder to Google Drive and to the external drive:\n  ${cfg.dir}\n(The files are encrypted; only your private key opens them.)`);
  } catch (e) { file.abort(); throw e; }
} catch (e) {
  try { await client.query("rollback"); } catch {}
  die(String(e.message ?? e).replace(/postgres(ql)?:\/\/\S+/g, "…"));
} finally {
  await client.end().catch(() => {});
}
