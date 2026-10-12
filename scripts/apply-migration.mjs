// Applies ONE migration file to DATABASE_URL inside a single transaction
// (all or nothing) and records it in supabase_migrations.schema_migrations,
// like `supabase db push` does. Refuses files already recorded.
//   npm run db:apply -- supabase/migrations/20261013000001_students.sql
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import pg from "pg";

const file = process.argv[2];
const m = file && basename(file).match(/^(\d{14})_(.+)\.sql$/);
if (!m || !process.env.DATABASE_URL) {
  console.error("Usage: npm run db:apply -- supabase/migrations/<version>_<name>.sql  (needs DATABASE_URL)");
  process.exit(2);
}
const [, version, name] = m;
const sql = readFileSync(file, "utf8");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  const { rowCount } = await client.query("select 1 from supabase_migrations.schema_migrations where version = $1", [version]);
  if (rowCount) throw new Error(`migration ${version} is already applied`);
  await client.query("begin");
  await client.query(sql);
  await client.query("insert into supabase_migrations.schema_migrations (version, name, statements) values ($1, $2, $3)", [version, name, [sql]]);
  await client.query("commit");
  console.log(`Applied ${version}_${name}`);
} catch (e) {
  await client.query("rollback").catch(() => {});
  console.error(`Not applied (nothing changed): ${e.message}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
