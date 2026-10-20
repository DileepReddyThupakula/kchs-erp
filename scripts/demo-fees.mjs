// DEMO fee data on the demo students: a mix of plans (monthly default,
// some one-time, some on a demo "Three terms" plan), one concession, full /
// partial / unpaid dues and one cancelled receipt. Payments go through the
// real collect_fee() as the demo Admin (dated earlier) or the demo office
// teacher (today), so they follow the same rules as the app.
//   npm run seed:demo-fees            (skips if demo receipts exist)
//   npm run wipe:demo-fees -- --yes   (removes ONLY demo fee data)
// Needs DATABASE_URL.
import pg from "pg";
import { assertDevOnly } from "./lib/prod-guard.mjs";
assertDevOnly("demo-fees.mjs");

const MODES = [
  ["cash", null],
  ["upi", "DEMO-UPI-"],
  ["cheque", "DEMO-CHQ-"],
  ["bank_transfer", "DEMO-NEFT-"],
];

async function withClaims(db, userId, fn) {
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
  try {
    return await fn();
  } finally {
    await db.query("select set_config('request.jwt.claims', '', true)");
  }
}

export async function seedDemoFees() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set (.env.local)");
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const { rows: done } = await db.query("select count(*)::int n from public.fee_receipts where is_demo");
    if (done[0].n > 0) return console.log(`Demo fee data already present (${done[0].n} receipts). Wipe first to reseed.`);
    const { rows: y } = await db.query("select id, name, start_date from public.academic_years where is_current");
    if (!y.length) throw new Error("No current academic year");
    const { rows: users } = await db.query("select employee_code, user_id from public.staff where employee_code in ('DEMO-ADM','DEMO-FEE') and user_id is not null");
    const adminUser = users.find((u) => u.employee_code === "DEMO-ADM")?.user_id;
    const officeUser = users.find((u) => u.employee_code === "DEMO-FEE")?.user_id;
    if (!adminUser || !officeUser) throw new Error("Demo admin / office logins missing (run seed:demo)");
    const { rows: students } = await db.query(
      `select s.id, s.admission_no, substring(s.admission_no from 6)::int as n from public.students s
        join public.student_enrollments e on e.student_id = s.id and e.academic_year_id = $1
       where s.is_demo order by s.admission_no`,
      [y[0].id],
    );
    if (!students.length) throw new Error("No demo students (run seed:demo-students)");
    const { rows: tuition } = await db.query("select id from public.fee_heads where code = 'TUITION'");
    const { rows: oneTime } = await db.query("select id from public.fee_plans where academic_year_id = $1 and name = 'One-time'", [y[0].id]);

    await db.query("begin");
    // demo custom plan: three terms 40 / 30 / 30
    const { rows: terms } = await db.query(
      `insert into public.fee_plans (academic_year_id, name, kind, due_day, is_demo) values ($1, 'Three terms (demo)', 'custom', 10, true) returning id`,
      [y[0].id],
    );
    const start = new Date(y[0].start_date);
    const yr = start.getFullYear();
    await db.query(
      `insert into public.fee_plan_installments (plan_id, seq, label, due_date, share_bp) values
         ($1, 1, 'Term 1', $2, 4000), ($1, 2, 'Term 2', $3, 3000), ($1, 3, 'Term 3', $4, 3000)`,
      [terms[0].id, `${yr}-06-10`, `${yr}-10-10`, `${yr + 1}-01-10`],
    );
    // plan overrides (the override trigger regenerates their dues)
    let overrides = 0;
    for (const s of students) {
      const plan = s.n % 5 === 0 ? oneTime[0]?.id : s.n % 7 === 0 ? terms[0].id : null;
      if (!plan) continue;
      await db.query(
        `insert into public.student_fee_plans (student_id, academic_year_id, fee_head_id, plan_id, reason) values ($1, $2, $3, $4, $5)`,
        [s.id, y[0].id, tuition[0].id, plan, s.n % 5 === 0 ? "Parent pays once a year (demo)" : "Parent pays per term (demo)"],
      );
      overrides++;
    }
    // one concession
    const conc = students.find((s) => s.n === 46) ?? students[0];
    await db.query(
      `insert into public.fee_concessions (student_id, academic_year_id, fee_head_id, kind, percent_bp, reason) values ($1, $2, $3, 'percent', 1000, 'Sibling concession 10% (demo)')`,
      [conc.id, y[0].id, tuition[0].id],
    );

    // payments: earlier-dated ones first, in date order, so receipt numbers follow the dates
    let receipts = 0;
    let firstPartial = null;
    const today = new Date().toISOString().slice(0, 10);
    const full = [];
    const partial = [];
    for (const s of students) {
      const kind = s.n % 3; // 0 = paid up to date, 1 = partial, 2 = unpaid
      const [mode, refPrefix] = MODES[s.n % MODES.length];
      const ref = refPrefix ? `${refPrefix}${String(s.n).padStart(4, "0")}` : null;
      if (kind === 0) {
        const payDate = `${yr}-${String(4 + (s.n % 6)).padStart(2, "0")}-15`;
        full.push({ s, mode, ref, payDate: payDate < today ? payDate : today });
      } else if (kind === 1) partial.push({ s, mode, ref });
    }
    full.sort((a, b) => a.payDate.localeCompare(b.payDate));
    for (const { s, mode, ref, payDate } of full) {
      // everything due by that date, paid by the Admin
      const { rows: due } = await db.query(
        `select id, amount_paise - concession_paise - paid_paise as bal from public.student_fee_dues
          where student_id = $1 and voided_at is null and due_date <= $2 and amount_paise - concession_paise - paid_paise > 0`,
        [s.id, today],
      );
      const total = due.reduce((a, d) => a + Number(d.bal), 0);
      if (!total) continue;
      await withClaims(db, adminUser, () =>
        db.query(`select public.collect_fee($1, $2, $3, $4, 'Demo payment', $5, $6)`, [s.id, total, mode, ref, due.map((d) => d.id), payDate]),
      );
      receipts++;
    }
    for (const { s, mode, ref } of partial) {
      // part of the first due, collected today by the office fee clerk
      const { rows: first } = await db.query(
        `select amount_paise - concession_paise - paid_paise as bal from public.student_fee_dues
          where student_id = $1 and voided_at is null order by due_date, installment_seq limit 1`,
        [s.id],
      );
      if (!first.length || Number(first[0].bal) < 200) continue;
      const part = Math.floor(Number(first[0].bal) / 2 / 100) * 100; // whole rupees
      const { rows } = await withClaims(db, officeUser, () => db.query(`select public.collect_fee($1, $2, $3, $4, 'Demo part payment') as id`, [s.id, part, mode, ref]));
      firstPartial ??= rows[0].id;
      receipts++;
    }
    // one cancelled receipt
    if (firstPartial) {
      await withClaims(db, adminUser, () => db.query(`select public.cancel_fee_receipt($1, 'Entered for the wrong student (demo)')`, [firstPartial]));
    }
    await db.query("commit");
    console.log(`Demo fees: ${overrides} plan overrides, 1 concession, ${receipts} receipts (1 cancelled).`);
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}

export async function wipeDemoFees() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set (.env.local)");
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    await db.query("begin");
    const items = await db.query(`delete from public.fee_receipt_items where receipt_id in (select id from public.fee_receipts where is_demo)`);
    const recs = await db.query(`delete from public.fee_receipts where is_demo`);
    // demo payments are gone: dues of demo students go back to unpaid
    await db.query(`update public.student_fee_dues set paid_paise = 0 where student_id in (select id from public.students where is_demo) and paid_paise <> 0`);
    const ov = await db.query(`delete from public.student_fee_plans where student_id in (select id from public.students where is_demo)`);
    const co = await db.query(`delete from public.fee_concessions where student_id in (select id from public.students where is_demo)`);
    await db.query(`delete from public.student_fee_dues where plan_id in (select id from public.fee_plans where is_demo)`);
    await db.query(`delete from public.fee_plans where is_demo`);
    // receipt counters: continue after the highest remaining (real) receipt
    await db.query(`
      update public.number_sequences ns
         set last_value = coalesce((select max(seq) from public.fee_receipts r where 'receipt:' || r.financial_year = ns.key), 0)
       where ns.key like 'receipt:%'`);
    // demo students' dues back to the plain fee structure
    const { rows } = await db.query(`select student_id, academic_year_id from public.student_enrollments where student_id in (select id from public.students where is_demo)`);
    for (const r of rows) await db.query(`select app.generate_dues($1, $2)`, [r.student_id, r.academic_year_id]);
    await db.query("commit");
    console.log(`Removed demo fee data: ${recs.rowCount} receipts (${items.rowCount} items), ${ov.rowCount} plan overrides, ${co.rowCount} concessions, demo plans. Real fee setup kept.`);
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}

const cmd = process.argv[2];
if (cmd === "seed") await seedDemoFees();
if (cmd === "wipe") {
  if (!process.argv.includes("--yes")) {
    console.error("This deletes all DEMO fee data (receipts, plan overrides, concessions of demo students). Re-run with: npm run wipe:demo-fees -- --yes");
    process.exit(2);
  }
  await wipeDemoFees();
}
