// Runs tests/db/*.sql against DATABASE_URL. Each file runs inside its own
// transaction that is ALWAYS rolled back, so the database is left untouched.
//   npm run test:db            -> all files
//   npm run test:db -- 01      -> files whose name contains "01"
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { assertDevOnly } from "./lib/prod-guard.mjs";
assertDevOnly("test-db.mjs");

const dir = join(import.meta.dirname, "..", "tests", "db");
const filter = process.argv[2] ?? "";
const helpers = readFileSync(join(dir, "_helpers.sql"), "utf8");
const files = readdirSync(dir)
  .filter((f) => f.endsWith(".sql") && !f.startsWith("_") && f.includes(filter))
  .sort();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (add it to .env.local)");
  process.exit(2);
}

// TEST_PRE_MIGRATION=<file.sql>: run an unapplied migration INSIDE each test
// transaction (rolled back with it), so a migration can be proven before it
// is applied to the database.
const pre = process.env.TEST_PRE_MIGRATION ? readFileSync(process.env.TEST_PRE_MIGRATION, "utf8") : "";
// TEST_TODAY=YYYY-MM-DD: pretend "today" (school time) is that date INSIDE each test transaction, so
// date-dependent tests can be proven on any weekday (e.g. TEST_TODAY=2026-10-17 is a Saturday).
const fakeToday = process.env.TEST_TODAY;
if (fakeToday && !/^\d{4}-\d{2}-\d{2}$/.test(fakeToday)) throw new Error("TEST_TODAY must be YYYY-MM-DD");
const clock = fakeToday ? `create or replace function app.today_ist() returns date language sql stable set search_path = '' as $$ select '${fakeToday}'::date $$;` : "";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

let failed = 0;
let total = 0;
let dbTotal = 0, dbFailed = 0, dbFiles = 0;
for (const file of files) {
  console.log(`\n# ${file}`);
  try {
    await client.query("begin");
    if (pre) await client.query(pre);
    if (clock) await client.query(clock);
    await client.query(helpers);
    await client.query(readFileSync(join(dir, file), "utf8"));
    await client.query("select set_config('role', 'postgres', true)");
    const { rows } = await client.query("select n, ok, description, detail from _results order by n");
    for (const r of rows) {
      total++;
      if (!r.ok) failed++;
      console.log(`${r.ok ? "ok" : "not ok"} ${r.n} - ${r.description}${r.detail ? `  # ${r.detail}` : ""}`);
    }
  } catch (e) {
    failed++;
    total++;
    console.log(`not ok - ${file} crashed: ${e.message}`);
  } finally {
    await client.query("rollback");
  }
}
dbTotal = total; dbFailed = failed; dbFiles = files.length;
await client.end();

// API tests: tests/api/*.mjs (sign in as demo users through Supabase, read-only)
const apiDir = join(import.meta.dirname, "..", "tests", "api");
const apiFiles = existsSync(apiDir) ? readdirSync(apiDir).filter((f) => f.endsWith(".mjs") && f.includes(filter)).sort() : [];
for (const file of apiFiles) {
  const mod = await import(join(apiDir, file));
  console.log(`\n# api/${file}: ${mod.name ?? ""}`);
  let n = 0;
  try {
    await mod.default({
      ok(cond, description, detail) {
        n++;
        total++;
        if (!cond) failed++;
        console.log(`${cond ? "ok" : "not ok"} ${n} - ${description}${!cond && detail ? `  # ${detail}` : ""}`);
      },
      skip(reason) {
        console.log(`# SKIPPED: ${reason}`);
      },
    });
  } catch (e) {
    failed++;
    total++;
    console.log(`not ok - api/${file} crashed: ${e.message}`);
  }
}

console.log(`\nDATABASE tests: ${dbTotal - dbFailed}/${dbTotal} passed (${dbFiles} files)`);
console.log(`API tests:      ${(total - dbTotal) - (failed - dbFailed)}/${total - dbTotal} passed (${apiFiles.length} files)`);
console.log(`TOTAL:          ${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
