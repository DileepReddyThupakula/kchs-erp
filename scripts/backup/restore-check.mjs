// npm run restore:check : the restore DRILL. Opens the newest backup, restores it into a THROW-AWAY local database
// (created in a temporary folder and deleted at the end), then checks that the data, the login accounts and the safety rules came back.
// Needs the private key (BACKUP_PRIVATE_KEY=/path/to/private-key.kchskey, passphrase asked) and PostgreSQL tools (brew install postgresql@17).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { config, decrypt, die, listBackups, readTar, requireOpenssl } from "./lib.mjs";
import { readDbBackup, restoreDb, run } from "./restore-lib.mjs";

requireOpenssl();
const cfg = config();
const flag = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const pick = (kind) => { const f = flag(kind === "db" ? "--db" : "--files"); if (f) return f; const l = listBackups(cfg.dir, kind); return l.length ? path.join(cfg.dir, l[l.length - 1]) : null; };
const dbFile = pick("db"), filesFile = pick("files");
if (!dbFile) die(`No database backup found in ${cfg.dir}. Run  npm run backup:db  first.`);
if (!cfg.privateKey || !fs.existsSync(cfg.privateKey)) die("Tell me where the private key is:  BACKUP_PRIVATE_KEY=/path/to/private-key.kchskey npm run restore:check   (the passphrase is asked next).");
const pgBin = ["/opt/homebrew/opt/postgresql@17/bin", "/opt/homebrew/opt/postgresql@16/bin", "/usr/local/opt/postgresql@17/bin"].find((d) => fs.existsSync(path.join(d, "initdb")));
if (!pgBin) die("The PostgreSQL server programs are needed for the drill:  brew install postgresql@17");
process.env.PATH = `${pgBin}:${process.env.PATH}`;

const results = [];
const check = (ok, what, detail = "") => { results.push({ ok, what, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${what}${detail ? "  " + detail : ""}`); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kchs-drill-"));
const sock = path.join(tmp, "s");
fs.mkdirSync(sock);
const port = String(54000 + Math.floor(Math.random() * 900));
const env = { ...process.env, PGHOST: sock, PGPORT: port, PGUSER: "postgres", PGDATABASE: "kchs_restore", PGPASSWORD: "", LC_ALL: "en_US.UTF-8", LANG: "en_US.UTF-8" };
let started = false;
let fatal = null;
try {
  console.log(`Database backup: ${path.basename(dbFile)}${filesFile ? `\nFiles backup:    ${path.basename(filesFile)}` : "\nFiles backup:    (none found)"}\nOpening (you may be asked for the passphrase)…`);
  const parts = await readDbBackup(dbFile, cfg.privateKey, cfg.publicKey);
  const m = parts.manifest;
  check(true, "the backup opens with your private key", `made ${m.createdAt}`);

  console.log("Starting a throw-away database…");
  const init = await run("initdb", ["-D", path.join(tmp, "data"), "-U", "postgres", "--auth=trust", "-E", "UTF8"], { env });
  if (init.code !== 0) throw new Error("Could not create the scratch database: " + init.err.slice(0, 200));
  const st = await run("pg_ctl", ["-D", path.join(tmp, "data"), "-o", `-c listen_addresses='' -c unix_socket_directories='${sock}' -p ${port} -c fsync=off`, "-w", "-l", path.join(tmp, "pg.log"), "start"], { env });
  if (st.code !== 0) throw new Error("Could not start the scratch database: " + st.err.slice(0, 200) + " " + (fs.existsSync(path.join(tmp, "pg.log")) ? fs.readFileSync(path.join(tmp, "pg.log"), "utf8").split("\n").slice(-3).join(" ") : ""));
  started = true;
  await run("createdb", ["kchs_restore"], { env: { ...env, PGDATABASE: "postgres" } });

  console.log("Restoring…");
  const log = await restoreDb(parts, env, { scratch: true });
  for (const l of log) console.log(`   ${l.step}: ${l.errors.length ? l.errors.length + " message(s)" : "no messages"}${l.errors.length ? "\n      " + l.errors.slice(0, 4).map((e) => e.slice(0, 170)).join("\n      ") : ""}`);

  const q = async (sql) => (await run("psql", ["-Atqc", sql], { env })).out.trim();
  // 1. every table has the same number of rows as when the backup was taken
  let bad = [];
  for (const [t, n] of Object.entries(m.counts)) {
    const [s, name] = t.split(".");
    const got = Number(await q(`select count(*) from "${s}"."${name}"`));
    if (got !== n) bad.push(`${t}: ${got} of ${n}`);
  }
  check(bad.length === 0, `row counts: all ${Object.keys(m.counts).length} tables match the backup`, bad.slice(0, 6).join("; "));
  // 2. the safety rules came back
  const policies = Number(await q("select count(*) from pg_policies where schemaname = 'public'"));
  check(policies === m.policies, "row-level security policies came back", `${policies} of ${m.policies}`);
  const funcs = Number(await q("select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','app')"));
  check(funcs === m.functions, "database functions came back", `${funcs} of ${m.functions}`);
  const rls = Number(await q("select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity"));
  check(rls === m.rls_tables, "row-level security is switched on for every table that had it", `${rls} of ${m.rls_tables}`);
  const anonFns = Number(await q("select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')"));
  check(anonFns === m.anon_functions, "permissions came back (functions a signed-out visitor may call)", `${anonFns} of ${m.anon_functions}`);
  const sp = Number(await q("select count(*) from pg_policies where schemaname = 'storage'"));
  check(sp === m.storage_policies, "file-storage access rules came back (who may open photos and documents)", `${sp} of ${m.storage_policies}`);
  const audit = await run("psql", ["-Atqc", "update public.audit_logs set action = 'tampered' where id = (select id from public.audit_logs limit 1)"], { env });
  check(audit.code !== 0 && /append-only|immutable|not allowed/i.test(audit.err), "the audit log is still tamper-proof (an edit is refused)", audit.err.trim().split("\n")[0]?.slice(0, 80));
  // 3. a login still exists and is linked to a staff record
  const email = process.env.BACKUP_CHECK_EMAIL || "admin@demo.kchs.test";
  const login = await q(`select u.encrypted_password is not null and length(u.encrypted_password) > 20 from auth.users u join public.staff s on s.user_id = u.id where u.email = '${email.replace(/'/g, "")}' and s.status = 'active'`);
  check(login === "t", `login ${email} exists, has a password and is linked to an active staff member`);
  // 4. files archive (integrity: every file opens, matches its checksum, and the count matches the file list in the database backup)
  if (filesFile) {
    const p = decrypt(filesFile, cfg.privateKey, cfg.publicKey);
    const seen = new Map(); let manifest = null;
    await readTar(p.stdout, async (name, _s, chunks) => {
      const h = crypto.createHash("sha256"); const o = [];
      for await (const c of chunks) { h.update(c); if (name === "manifest.json") o.push(c); }
      if (name === "manifest.json") manifest = JSON.parse(Buffer.concat(o).toString()); else seen.set(name, h.digest("hex"));
    });
    await new Promise((r) => p.on("close", r));
    const wrong = manifest ? manifest.files.filter((f) => seen.get(`files/${f.bucket}/${f.path}`) !== f.sha256).length : -1;
    check(!!manifest && wrong === 0, "files archive: every file opens and matches its checksum", manifest ? `${manifest.files.length} files` : "no manifest");
    const listed = Number(await q("select count(*) from storage.objects where name not like '%.emptyFolderPlaceholder'"));
    check(manifest && manifest.files.length === listed, "files archive holds every file named in the database backup", `${manifest?.files.length} files, ${listed} listed`);
  }
} catch (e) {
  fatal = String(e.message ?? e);
} finally {
  if (started) await run("pg_ctl", ["-D", path.join(tmp, "data"), "-m", "immediate", "stop"], { env });
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("\nThe throw-away database was deleted.");
}
if (fatal) { console.error("\nSTOP: " + fatal); process.exit(1); }
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? `${failed} CHECK(S) FAILED. Do not trust this backup until you know why.` : "ALL CHECKS PASSED."}`);
console.log(`
Not covered by a database backup (set these again in a new project; see docs/BACKUP.md):
  - Supabase Auth settings in the dashboard (password rules, rate limits, session length, leaked-password protection, site URL)
  - the hosting settings (environment variables, domain)
  - the files themselves, unless you also restore the files archive (npm run restore:files)
  - the private key and passphrase (they are NOT in any backup, on purpose)`);
process.exit(failed ? 1 : 0);
