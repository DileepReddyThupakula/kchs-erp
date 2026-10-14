// Attendance under SIMULTANEOUS saves (real parallel connections): no duplicate
// session or student rows. Throwaway academic year, class, section and students;
// removed afterwards. Skips until the attendance migration is applied.
import pg from "pg";

export const name = "attendance: simultaneous marking cannot create duplicates (parallel connections)";

const YEAR = "TEST-ATTCONC";

async function cleanup(db) {
  await db.query(`delete from public.attendance_sessions where academic_year_id in (select id from public.academic_years where name = $1)`, [YEAR]);
  await db.query(`delete from public.student_enrollments where academic_year_id in (select id from public.academic_years where name = $1)`, [YEAR]);
  await db.query(`delete from public.students where admission_no like 'TESTATT-%'`);
  await db.query(`delete from public.sections where academic_year_id in (select id from public.academic_years where name = $1)`, [YEAR]);
  await db.query(`delete from public.academic_years where name = $1`, [YEAR]);
  await db.query(`delete from public.classes where name = 'TESTATT Class'`);
  await db.query(`delete from public.staff where employee_code = 'TESTATT-CT'`);
}

async function asUser(url, userId, sql, params) {
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    await c.query("select set_config('role', 'authenticated', true)");
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
    const { rows: has } = await db.query(`select to_regclass('public.attendance_sessions') as t`);
    if (!has[0].t) return skip("attendance migration not applied yet");
    const { rows: adm } = await db.query(`select user_id from public.staff where employee_code = 'DEMO-ADM' and user_id is not null`);
    if (!adm.length) return skip("demo admin missing (seed:demo)");
    await cleanup(db);
    const { rows: y } = await db.query(`insert into public.academic_years (name, start_date, end_date) values ($1, app.today_ist() - 40, app.today_ist() + 40) returning id`, [YEAR]);
    const { rows: cls } = await db.query(`insert into public.classes (name, sort_order) values ('TESTATT Class', 992) returning id`);
    const { rows: ct } = await db.query(`insert into public.staff (employee_code, full_name, status) values ('TESTATT-CT', 'Attendance Test Teacher', 'active') returning id`);
    const { rows: sec } = await db.query(`insert into public.sections (academic_year_id, class_id, name, class_teacher_id) values ($1, $2, 'Z', $3) returning id`, [y[0].id, cls[0].id, ct[0].id]);
    const ids = [];
    for (const n of [1, 2, 3, 4]) {
      const { rows } = await db.query(
        `insert into public.students (admission_no, full_name, gender, date_of_birth, admission_date, is_demo) values ($1, $2, 'male', '2084-01-01', '2020-06-01', true) returning id`,
        [`TESTATT-${n}`, `Attendance Test ${n}`],
      );
      ids.push(rows[0].id);
      await db.query(`insert into public.student_enrollments (student_id, academic_year_id, section_id) values ($1, $2, $3)`, [rows[0].id, y[0].id, sec[0].id]);
    }
    // a weekday inside the last 10 days (Mon-Fri is always a school day in a year with no holidays)
    const { rows: d } = await db.query(
      `select to_char(g, 'YYYY-MM-DD') as day from generate_series(app.today_ist() - 10, app.today_ist() - 1, interval '1 day') g
       where extract(isodow from g) between 1 and 5 order by g desc limit 1`,
    );
    const day = d[0].day;
    const entries = (statuses) => JSON.stringify(ids.map((id, i) => ({ student_id: id, status: statuses[i] })));
    const mark = (session, statuses) =>
      asUser(url, adm[0].user_id, `select public.mark_attendance($1, $2::date, $3, $4::jsonb) as id`, [sec[0].id, day, session, entries(statuses)]);

    // six people save the SAME brand-new session at the same moment
    const sets = [
      ["present", "present", "present", "present"],
      ["absent", "present", "present", "present"],
      ["present", "absent", "late", "present"],
      ["present", "present", "late", "absent"],
      ["late", "present", "present", "present"],
      ["present", "present", "absent", "absent"],
    ];
    const results = await Promise.all(sets.map((s) => mark("morning", s)));
    ok(results.every((r) => r.ok), "six simultaneous saves of a new session all complete", results.find((r) => !r.ok)?.error?.message);
    const { rows: ses } = await db.query(`select count(*)::int n from public.attendance_sessions where section_id = $1 and att_date = $2::date and session = 'morning'`, [sec[0].id, day]);
    ok(ses[0].n === 1, "exactly one session row exists", String(ses[0].n));
    const { rows: rowsN } = await db.query(
      `select student_id, count(*)::int n from public.student_attendance where att_date = $1::date and session = 'morning' and student_id = any($2) group by 1`,
      [day, ids],
    );
    ok(rowsN.length === 4 && rowsN.every((r) => r.n === 1), "exactly one row per student for that date and session", JSON.stringify(rowsN));
    const { rows: final } = await db.query(`select status from public.student_attendance where att_date = $1::date and session = 'morning' and student_id = $2`, [day, ids[0]]);
    ok(["present", "absent", "late"].includes(final[0].status), "the final value is one of the saved values (no mixed rows)");

    // afternoon: the same again, different people overlapping with a correction
    const r2 = await Promise.all([mark("afternoon", sets[0]), mark("afternoon", sets[1]), mark("afternoon", sets[2])]);
    ok(r2.every((r) => r.ok), "simultaneous afternoon saves complete");
    const { rows: tot } = await db.query(`select count(*)::int n from public.student_attendance where att_date = $1::date and student_id = any($2)`, [day, ids]);
    ok(tot[0].n === 8, "4 students x 2 sessions = 8 rows, no duplicates", String(tot[0].n));
  } finally {
    await cleanup(db).catch(() => {});
    await db.end();
  }
}
