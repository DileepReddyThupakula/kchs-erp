// run SQL quickly: node --env-file=.env.local scripts/dev/q.mjs "select ..."
import pg from "pg";
import { assertDevOnly } from "../lib/prod-guard.mjs";
assertDevOnly("q.mjs");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const r = await c.query(process.argv[2]);
console.log(JSON.stringify(r.rows, null, 0).replace(/\},\{/g, "},\n{"));
await c.end();
