// Applies migration files to DATABASE_URL, each inside its own transaction (all or nothing), and records each in
// supabase_migrations.schema_migrations like `supabase db push` does. Refuses files already recorded.
//   npm run db:apply -- supabase/migrations/20261013000001_students.sql        one file (development)
//   npm run db:apply -- --all                                                  every file not yet applied, in order (development)
//   npm run db:apply -- --all --production                                     the same on PRODUCTION (reads .env.kchs-production, asks you to confirm)
import { readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import pg from "pg";
import { useTarget } from "./lib/prod-guard.mjs";

const target = await useTarget("db:apply");           // dev only, unless --production (then: production file + typed confirmation)
const all = process.argv.includes("--all");
const files = all
  ? readdirSync("supabase/migrations").filter((f) => /^\d{14}_.+\.sql$/.test(f)).sort().map((f) => join("supabase/migrations", f))
  : process.argv.slice(2).filter((a) => !a.startsWith("--")).slice(0, 1);
if (!files.length || files.some((f) => !basename(f).match(/^(\d{14})_(.+)\.sql$/)) || !process.env.DATABASE_URL) {
  console.error("Usage: npm run db:apply -- supabase/migrations/<version>_<name>.sql   or   npm run db:apply -- --all [--production]  (needs DATABASE_URL)");
  process.exit(2);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
let applied = 0, skipped = 0;
try {
  // a brand-new project has no migration table yet
  await client.query("create schema if not exists supabase_migrations");
  await client.query("create table if not exists supabase_migrations.schema_migrations (version text primary key, statements text[], name text, created_by text, idempotency_key text, rollback text[])");
  for (const file of files) {
    const [, version, name] = basename(file).match(/^(\d{14})_(.+)\.sql$/);
    const { rowCount } = await client.query("select 1 from supabase_migrations.schema_migrations where version = $1", [version]);
    if (rowCount) { if (all) { skipped++; continue; } throw new Error(`migration ${version} is already applied`); }
    const sql = readFileSync(file, "utf8");
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)", [version, name, [sql]]);
      await client.query("commit");
    } catch (e) {
      await client.query("rollback").catch(() => {});
      throw new Error(`${version}_${name}: ${e.message}`);
    }
    applied++;
    console.log(`Applied ${version}_${name}`);
  }
  console.log(`${target === "production" ? "PRODUCTION: " : ""}${applied} applied${skipped ? `, ${skipped} already there` : ""}.`);
} catch (e) {
  console.error(`Stopped (the failing file changed nothing): ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
