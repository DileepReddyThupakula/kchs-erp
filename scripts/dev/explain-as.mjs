import pg from "pg";
import { assertDevOnly } from "../lib/prod-guard.mjs";
assertDevOnly("explain-as.mjs");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const who = process.argv[2];
const { rows: u } = await c.query("select user_id from staff where employee_code = $1", [who]);
await c.query("begin");
await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: u[0].user_id, role: "authenticated" })]);
await c.query("set local role authenticated");
for (const q of process.argv.slice(3)) {
  const r = await c.query("explain (analyze, timing off) " + q);
  const t = r.rows.map((x) => x["QUERY PLAN"]);
  console.log("\n" + q + "\n" + t.filter((l) => /Execution Time|Planning Time|Seq Scan|Index|Rows Removed|actual rows=/.test(l)).slice(0, 8).join("\n"));
}
await c.query("rollback");
await c.end();
