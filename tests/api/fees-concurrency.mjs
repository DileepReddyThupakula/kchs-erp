// Receipt numbering and dues under SIMULTANEOUS saves (real parallel
// connections). Uses a throwaway academic year (2090-91) and student, and
// removes everything afterwards. Needs DATABASE_URL and the demo admin.
import pg from "pg";

export const name = "fees: simultaneous payments (8 parallel connections)";

const YEAR = "TEST-FEECONC-2090";

async function cleanup(db) {
  await db.query(`delete from public.fee_receipt_items where receipt_id in (select id from public.fee_receipts where financial_year = '2090-91')`);
  await db.query(`delete from public.fee_receipts where financial_year = '2090-91'`);
  await db.query(`delete from public.number_sequences where key = 'receipt:2090-91'`);
  await db.query(`delete from public.student_fee_dues where academic_year_id in (select id from public.academic_years where name = $1)`, [YEAR]);
  await db.query(`delete from public.student_enrollments where academic_year_id in (select id from public.academic_years where name = $1)`, [YEAR]);
  await db.query(`delete from public.students where admission_no like 'TESTCONC-%'`);
  await db.query(`delete from public.fee_structure where academic_year_id in (select id from public.academic_years where name = $1)`, [YEAR]);
  await db.query(`delete from public.sections where academic_year_id in (select id from public.academic_years where name = $1)`, [YEAR]);
  await db.query(`delete from public.academic_years where name = $1`, [YEAR]);
}

async function asUser(url, userId, sql, params) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    const r = await c.query(sql, params);
    await c.query("commit");
    return { ok: true, rows: r.rows };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    return { ok: false, error: e };
  } finally {
    await c.end();
  }
}

export default async function run({ ok, skip }) {
  const url = process.env.DATABASE_URL;
  if (!url) return skip("DATABASE_URL missing");
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    const { rows: adm } = await db.query(`select user_id from public.staff where employee_code = 'DEMO-ADM' and user_id is not null`);
    const { rows: head } = await db.query(`select id from public.fee_heads where code = 'TUITION'`);
    const { rows: cls } = await db.query(`select id from public.classes where name = 'Class 1'`);
    if (!adm.length || !head.length || !cls.length) return skip("demo admin / Tuition head / Class 1 missing (seed:school, seed:demo)");
    await cleanup(db);

    // fixture (committed): year, section, plan, structure ₹1,00,000, two students
    const { rows: y } = await db.query(`insert into public.academic_years (name, start_date, end_date) values ($1, '2090-04-01', '2091-03-31') returning id`, [YEAR]);
    const { rows: sec } = await db.query(`insert into public.sections (academic_year_id, class_id, name) values ($1, $2, 'Z') returning id`, [y[0].id, cls[0].id]);
    const { rows: plan } = await db.query(`insert into public.fee_plans (academic_year_id, name, kind) values ($1, 'One-time', 'one_time') returning id`, [y[0].id]);
    await db.query(`insert into public.fee_structure (academic_year_id, class_id, fee_head_id, amount_paise, default_plan_id) values ($1, $2, $3, 10000000, $4)`, [y[0].id, cls[0].id, head[0].id, plan[0].id]);
    const ids = [];
    for (const n of [1, 2]) {
      const { rows } = await db.query(
        `insert into public.students (admission_no, full_name, gender, date_of_birth, admission_date, is_demo) values ($1, $2, 'male', '2084-01-01', '2089-06-01', true) returning id`,
        [`TESTCONC-${n}`, `Concurrency Test ${n}`],
      );
      ids.push(rows[0].id);
      await db.query(`insert into public.student_enrollments (student_id, academic_year_id, section_id) values ($1, $2, $3)`, [rows[0].id, y[0].id, sec[0].id]);
    }

    // 8 payments of ₹1,000 at the same moment
    const pay = (student, paise) =>
      asUser(url, adm[0].user_id, `select public.collect_fee($1, $2, 'cash', null, null, null, '2090-05-01') as id`, [student, paise]);
    const results = await Promise.all(Array.from({ length: 8 }, () => pay(ids[0], 100000)));
    ok(results.every((r) => r.ok), "8 simultaneous payments all saved", results.find((r) => !r.ok)?.error?.message);
    const { rows: rc } = await db.query(`select seq, receipt_no from public.fee_receipts where financial_year = '2090-91' order by seq`);
    ok(rc.length === 8 && rc.every((r, i) => r.seq === i + 1), "receipt numbers are 1–8 with no gaps", rc.map((r) => r.seq).join(","));
    ok(new Set(rc.map((r) => r.receipt_no)).size === 8, "no duplicate receipt numbers");
    const { rows: due } = await db.query(`select paid_paise from public.student_fee_dues where student_id = $1 and voided_at is null`, [ids[0]]);
    ok(Number(due[0].paid_paise) === 800000, "the due shows exactly ₹8,000 paid", due[0]?.paid_paise);

    // two simultaneous ₹60,000 payments against a ₹1,00,000 due: only one may succeed
    const race = await Promise.all([pay(ids[1], 6000000), pay(ids[1], 6000000)]);
    ok(race.filter((r) => r.ok).length === 1, "simultaneous overpayment: exactly one succeeds", race.map((r) => (r.ok ? "ok" : r.error.message)).join(" | "));
    const { rows: due2 } = await db.query(`select paid_paise, amount_paise from public.student_fee_dues where student_id = $1 and voided_at is null`, [ids[1]]);
    ok(Number(due2[0].paid_paise) === 6000000, "the due was never overpaid");
    const { rows: rc2 } = await db.query(`select seq from public.fee_receipts where financial_year = '2090-91' order by seq`);
    ok(rc2.length === 9 && rc2[8].seq === 9, "the failed payment left no gap in numbering (next is 9)");
  } finally {
    await cleanup(db).catch(() => {});
    await db.end();
  }
}
