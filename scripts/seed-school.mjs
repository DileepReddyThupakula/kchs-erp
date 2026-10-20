// Applies the REAL school configuration (supabase/seed/school_config.sql).
// Idempotent and safe to re-run. Kept by `npm run seed:wipe`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { assertDevOnly } from "./lib/prod-guard.mjs";
assertDevOnly("seed-school.mjs");

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set (add it to .env.local)");
  process.exit(2);
}
const sql = readFileSync(join(import.meta.dirname, "..", "supabase", "seed", "school_config.sql"), "utf8");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  const { rows } = await client.query(`select
    (select name from public.school_settings) as school,
    (select count(*) from public.classes) as classes,
    (select count(*) from public.subjects) as subjects,
    (select count(*) from public.class_subjects) as class_subject_links`);
  console.log("School configuration applied:", rows[0]);
} catch (e) {
  await client.query("rollback");
  console.error("Failed, nothing changed:", e.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
