// Timetable rules under SIMULTANEOUS saves (real parallel connections).
// Throwaway academic year 2091-92, class, two sections, two teachers; removed afterwards.
// Skips until the timetable migration is applied. Needs DATABASE_URL.
import pg from "pg";

export const name = "timetable: simultaneous saves cannot double-book (parallel connections)";

const YEAR = "TEST-TTCONC-2091";

async function cleanup(db) {
  await db.query(`delete from public.timetable_substitutions where section_id in (select s.id from public.sections s join public.academic_years y on y.id = s.academic_year_id where y.name = $1)`, [YEAR]);
  await db.query(`delete from public.timetable_entries where academic_year_id in (select id from public.academic_years where name = $1)`, [YEAR]);
  await db.query(`delete from public.teacher_assignments where staff_id in (select id from public.staff where employee_code like 'TESTTT-%')`);
  await db.query(`delete from public.sections where academic_year_id in (select id from public.academic_years where name = $1)`, [YEAR]);
  await db.query(`delete from public.academic_years where name = $1`, [YEAR]);
  await db.query(`delete from public.staff where employee_code like 'TESTTT-%'`);
  await db.query(`delete from public.classes where name = 'TESTTT Class'`);
  await db.query(`delete from public.subjects where code = 'TESTTT'`);
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
    const { rows: has } = await db.query(`select to_regclass('public.timetable_entries') as t`);
    if (!has[0].t) return skip("timetable migration not applied yet");
    const { rows: adm } = await db.query(`select user_id from public.staff where employee_code = 'DEMO-ADM' and user_id is not null`);
    if (!adm.length) return skip("demo admin missing (seed:demo)");
    await cleanup(db);
    const { rows: y } = await db.query(`insert into public.academic_years (name, start_date, end_date) values ($1, '2091-04-01', '2092-03-31') returning id`, [YEAR]);
    const { rows: cls } = await db.query(`insert into public.classes (name, sort_order) values ('TESTTT Class', 991) returning id`);
    const { rows: sub } = await db.query(`insert into public.subjects (name, code) values ('TESTTT Subject', 'TESTTT') returning id`);
    const secs = [];
    for (const n of ["X", "Y", "Z"]) {
      const { rows } = await db.query(`insert into public.sections (academic_year_id, class_id, name) values ($1, $2, $3) returning id`, [y[0].id, cls[0].id, n]);
      secs.push(rows[0].id);
    }
    const t = [];
    for (const n of [1, 2, 3]) {
      const { rows } = await db.query(`insert into public.staff (employee_code, full_name, status) values ($1, $2, 'active') returning id`, [`TESTTT-${n}`, `Timetable Test ${n}`]);
      t.push(rows[0].id);
    }
    for (const s of secs) for (const tt of t) await db.query(`insert into public.teacher_assignments (staff_id, section_id, subject_id) values ($1, $2, $3)`, [tt, s, sub[0].id]);

    const put = (section, wd, p, teacher) =>
      asUser(url, adm[0].user_id, `insert into public.timetable_entries (section_id, weekday, period_no, subject_id, teacher_id) values ($1, $2, $3, $4, $5) returning id`, [section, wd, p, sub[0].id, teacher]);

    // same teacher, same weekday + period, two different sections, at the same moment
    const r1 = await Promise.all([put(secs[0], 1, 1, t[0]), put(secs[1], 1, 1, t[0])]);
    ok(r1.filter((r) => r.ok).length === 1, "two simultaneous saves of one teacher into two sections: exactly one wins", r1.map((r) => (r.ok ? "ok" : r.error.message)).join(" | "));
    // same section cell, two different teachers
    const r2 = await Promise.all([put(secs[2], 1, 2, t[0]), put(secs[2], 1, 2, t[1])]);
    ok(r2.filter((r) => r.ok).length === 1, "two simultaneous saves of one cell: exactly one wins", r2.map((r) => (r.ok ? "ok" : r.error.message)).join(" | "));
    // 6 teachers' worth of parallel saves into the same period
    const r3 = await Promise.all([put(secs[0], 2, 3, t[2]), put(secs[1], 2, 3, t[2]), put(secs[2], 2, 3, t[2])]);
    ok(r3.filter((r) => r.ok).length === 1, "three simultaneous saves of one teacher: exactly one wins", r3.map((r) => (r.ok ? "ok" : r.error.message)).join(" | "));
    const { rows: dup } = await db.query(
      `select teacher_id, weekday, period_no, count(*) from public.timetable_entries where academic_year_id = $1 and teacher_id is not null group by 1, 2, 3 having count(*) > 1`,
      [y[0].id],
    );
    ok(dup.length === 0, "the database holds no double-booked teacher");

    // substitutions: one substitute, one period, two sections, same moment
    await db.query(`insert into public.timetable_entries (section_id, weekday, period_no, subject_id, teacher_id) values ($1, 3, 4, $4, $2), ($3, 3, 4, $4, $5)`, [secs[0], t[0], secs[1], sub[0].id, t[1]]);
    // 2091-04-02 is a Wednesday? compute a Wednesday inside the year
    const { rows: wed } = await db.query(`select to_char(d, 'YYYY-MM-DD') day from generate_series('2091-06-01'::date, '2091-06-10'::date, interval '1 day') d where extract(isodow from d) = 3 limit 1`);
    const cover = (section, orig) =>
      asUser(url, adm[0].user_id, `insert into public.timetable_substitutions (sub_date, section_id, period_no, original_teacher_id, substitute_teacher_id) values ($1, $2, 4, $3, $4) returning id`, [wed[0].day, section, orig, t[2]]);
    const r4 = await Promise.all([cover(secs[0], t[0]), cover(secs[1], t[1])]);
    ok(r4.filter((r) => r.ok).length === 1, "one substitute cannot cover two classes in the same period (simultaneous)", r4.map((r) => (r.ok ? "ok" : r.error.message)).join(" | "));

    // entry vs substitution race for the SAME teacher / weekday / period
    const { rows: wk } = await db.query(`select to_char(d, 'YYYY-MM-DD') day from generate_series('2091-06-11'::date, '2091-06-20'::date, interval '1 day') d where extract(isodow from d) = 4 limit 1`);
    await db.query(`insert into public.timetable_entries (section_id, weekday, period_no, subject_id, teacher_id) values ($1, 4, 5, $3, $2)`, [secs[0], t[0], sub[0].id]);
    const coverThu = asUser(url, adm[0].user_id, `insert into public.timetable_substitutions (sub_date, section_id, period_no, original_teacher_id, substitute_teacher_id) values ($1, $2, 5, $3, $4) returning id`, [wk[0].day, secs[0], t[0], t[1]]);
    const entryThu = put(secs[1], 4, 5, t[1]);
    const r5 = await Promise.all([coverThu, entryThu]);
    ok(r5.filter((r) => r.ok).length === 1, "a permanent entry and a substitution for the same teacher/slot cannot both win", r5.map((r) => (r.ok ? "ok" : r.error.message)).join(" | "));
  } finally {
    await cleanup(db).catch(() => {});
    await db.end();
  }
}
