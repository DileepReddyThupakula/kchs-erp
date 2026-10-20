// Row counts + md5 per exam table, for proving a manual test left the data as it was:
//   node --env-file=.env.local scripts/dev/exam-snapshot.mjs > before.json   (then again -> after.json; diff)
import pg from "pg";
import { assertDevOnly } from "../lib/prod-guard.mjs";
assertDevOnly("exam-snapshot.mjs");
const t = ["exam_components", "exam_subject_max", "result_groups", "result_group_members", "subject_pass_marks", "marks", "subject_results", "student_results", "grade_entries", "grade_bands", "descriptive_grades", "remark_bank", "report_remarks", "report_card_prints", "exam_class_modes"];
const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const out = {};
for (const x of t) {
  const cols = (await c.query(`select string_agg(column_name, ',' order by column_name) s from information_schema.columns where table_schema='public' and table_name=$1 and column_name not in ('created_at','updated_at','updated_by','created_by','calc','calculated_at','printed_at')`, [x])).rows[0].s;
  const r = await c.query(`select count(*)::int n, coalesce(md5(string_agg(md5(row(${cols.split(",").map((k) => `"${k}"`).join(",")})::text), '' order by md5(row(${cols.split(",").map((k) => `"${k}"`).join(",")})::text))), '') h from public.${x}`);
  out[x] = r.rows[0];
}
await c.end();
console.log(JSON.stringify(out, null, 1));
