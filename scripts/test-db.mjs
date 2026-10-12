// Runs tests/db/*.sql against DATABASE_URL. Each file runs inside its own
// transaction that is ALWAYS rolled back, so the database is left untouched.
//   npm run test:db            -> all files
//   npm run test:db -- 01      -> files whose name contains "01"
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

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

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

let failed = 0;
let total = 0;
for (const file of files) {
  console.log(`\n# ${file}`);
  try {
    await client.query("begin");
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

console.log(`\n${total - failed}/${total} passed`);
process.exit(failed ? 1 : 0);
