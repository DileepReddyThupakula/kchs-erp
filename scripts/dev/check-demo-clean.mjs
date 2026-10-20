// After a browser session or a test run: lists anything that differs from the plain demo data. Read-only.
//   node --env-file=.env.local scripts/dev/check-demo-clean.mjs
import pg from "pg";
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await c.connect();
const q = async (title, sql) => { const r = (await c.query(sql)).rows; console.log(`${r.length ? "CHECK" : "ok   "}  ${title}${r.length ? ": " + JSON.stringify(r) : ""}`); };
await q("students who are not Active", "select admission_no, status from public.students where status <> 'active'");
await q("certificates, prints or numbering series left behind", "select 'certificates' t, count(*) n from public.certificates having count(*) > 0 union all select 'prints', count(*) from public.certificate_prints having count(*) > 0 union all select 'series', count(*) from public.certificate_series having count(*) > 0");
await q("people holding the certificates duty", "select s.employee_code from public.staff_permissions p join public.staff s on s.id = p.staff_id where p.duty = 'certificates_idcards'");
await q("certificate settings or templates changed from the defaults", "select kind, layout_draft, wording_confirmed from public.certificate_templates where not layout_draft or wording_confirmed union all select 'settings', show_signature_image, (prefix_tc, prefix_bonafide, prefix_study) <> ('TC', 'BON', 'STU') from public.certificate_settings where show_signature_image or (prefix_tc, prefix_bonafide, prefix_study) <> ('TC', 'BON', 'STU')");
await q("rollovers", "select id, status from public.rollover_runs");
await q("extra academic years", "select name from public.academic_years where name <> '2026-27'");
await q("throw-away test rows (years, classes, staff)", "select name from public.academic_years where name ~ '^(TEST|TMP|CE-|RO-|AU-)' union all select name from public.classes where name ~ '^(TEST|CE |RO )' union all select employee_code from public.staff where employee_code ~ '^(TEST|CE-|RO-|AU-)'");
await c.end();
