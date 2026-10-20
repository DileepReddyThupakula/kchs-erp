// DEMO attendance: about two weeks of student attendance for the demo
// students (both sessions, marked by whoever the timetable says), staff
// leave requests (approved / pending / rejected) and staff attendance.
// Today is left unmarked so the teacher screens have something to mark.
//   npm run seed:demo-attendance            (skips if demo attendance exists)
//   npm run wipe:demo-attendance -- --yes   (removes ONLY demo attendance + demo leave)
// Needs DATABASE_URL and the demo timetable (seed:demo-timetable).
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { assertDevOnly } from "./lib/prod-guard.mjs";
assertDevOnly("demo-attendance.mjs");

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export async function seedDemoAttendance() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set (.env.local)");
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const dry = process.env.DRY_RUN === "1";
  try {
    if (dry) {
      await db.query("begin");
      if (process.env.TEST_PRE_MIGRATION) await db.query(readFileSync(process.env.TEST_PRE_MIGRATION, "utf8"));
    }
    const { rows: has } = await db.query("select to_regclass('public.attendance_sessions') as t");
    if (!has[0].t) return console.log("Attendance tables not found: apply the attendance migration first.");
    const { rows: done } = await db.query("select count(*)::int n from public.attendance_sessions where is_demo");
    if (done[0].n > 0) return console.log(`Demo attendance already present (${done[0].n} sessions). Wipe first to reseed.`);
    const { rows: y } = await db.query("select id, name from public.academic_years where is_current");
    if (!y.length) throw new Error("No current academic year");
    const rand = rng(20261017);

    const { rows: days } = await db.query(
      `select to_char(d, 'YYYY-MM-DD') as day from generate_series(app.today_ist() - 14, app.today_ist() - 1, interval '1 day') d
       where app.is_school_day($1, d::date) order by 1`,
      [y[0].id],
    );
    const { rows: sections } = await db.query(
      `select s.id, s.class_teacher_id from public.sections s where s.academic_year_id = $1`,
      [y[0].id],
    );
    const { rows: roster } = await db.query(
      `select en.section_id, st.id as student_id from public.student_enrollments en join public.students st on st.id = en.student_id
       where en.academic_year_id = $1 and en.status = 'active' and st.status = 'active' and st.is_demo`,
      [y[0].id],
    );
    const { rows: adm } = await db.query("select id from public.staff where employee_code = 'DEMO-ADM'");
    const adminId = adm[0]?.id ?? null;
    const bySection = new Map();
    for (const r of roster) (bySection.get(r.section_id) ?? bySection.set(r.section_id, []).get(r.section_id)).push(r.student_id);

    let sessionsN = 0;
    let rowsN = 0;
    let skipped = 0;
    for (const { day } of days) {
      for (const sec of sections) {
        const students = bySection.get(sec.id);
        if (!students?.length) continue;
        const { rows: res } = await db.query("select session, period_no, staff_id, source from app.session_resolve($1, $2::date)", [sec.id, day]);
        for (const r of res) {
          if (rand() < 0.03) {
            skipped++;
            continue; // a missed session
          }
          const correction = rand() < 0.03 && adminId;
          const markedBy = correction ? adminId : (r.staff_id ?? sec.class_teacher_id);
          const kind = correction ? "correction" : r.source === "substitute" ? "substitute" : "regular";
          const { rows: s } = await db.query(
            `insert into public.attendance_sessions (academic_year_id, section_id, att_date, session, period_no, assigned_to, marked_by, marked_at, kind, is_demo)
             values ($1, $2, $3, $4, $5, $6, $7, ($3::date + case when $4 = 'morning' then time '09:10' else time '12:50' end)::timestamptz, $8, true)
             returning id`,
            [y[0].id, sec.id, day, r.session, r.period_no, r.staff_id, markedBy, kind],
          );
          sessionsN++;
          for (const st of students) {
            const x = rand();
            const status = x < 0.91 ? "present" : x < 0.97 ? "absent" : "late";
            await db.query(
              `insert into public.student_attendance (session_id, student_id, status, marked_by, is_demo) values ($1, $2, $3, $4, true)`,
              [s[0].id, st, status, markedBy],
            );
            rowsN++;
          }
        }
      }
    }

    // ---- staff leave (dates relative to today, only on school days)
    const { rows: staff } = await db.query(
      "select id, employee_code from public.staff where employee_code like 'DEMO-T%' and status = 'active' order by employee_code",
    );
    const { rows: types } = await db.query("select id, name from public.leave_types order by sort_order");
    const typeId = Object.fromEntries(types.map((t) => [t.name, t.id]));
    const sched = [
      // [staff index, type, from offset, to offset, status, reason, note]
      [0, "Casual", -12, -11, "approved", "Family function", "Approved"],
      [2, "Sick", -9, -7, "approved", "Fever", "Get well soon"],
      [4, "Sick", 0, 1, "approved", "Medical check-up", "Approved"],
      [5, "Casual", 3, 3, "pending", "Personal work", null],
      [6, "Other", 5, 6, "pending", "Training workshop", null],
      [7, "Casual", -5, -5, "rejected", "Shopping", "Not possible during exams"],
      [9, "Sick", 8, 9, "pending", "Dental treatment", null],
    ];
    let leaveN = 0;
    for (const [i, type, a, b, status, reason, note] of sched) {
      const st = staff[i];
      if (!st) continue;
      await db.query(
        `insert into public.leave_requests (staff_id, leave_type_id, from_date, to_date, reason, status, decided_by, decided_at, decision_note, is_demo)
         select $1, $2, app.today_ist() + $3::int, app.today_ist() + $4::int, $5, $6::text,
                case when $6::text = 'pending' then null else $7::uuid end, case when $6::text = 'pending' then null else now() end, $8, true
         where app.leave_days(app.today_ist() + $3::int, app.today_ist() + $4::int) > 0`,
        [st.id, typeId[type], a, b, reason, status, adminId, note],
      );
      leaveN++;
    }

    // ---- staff attendance for the same school days (approved leave -> on_leave)
    const { rows: allStaff } = await db.query("select id from public.staff where employee_code like 'DEMO-%' and status = 'active'");
    let staffRows = 0;
    for (const { day } of days) {
      for (const st of allStaff) {
        const { rows: lv } = await db.query(
          "select 1 from public.leave_requests where staff_id = $1 and status = 'approved' and $2::date between from_date and to_date",
          [st.id, day],
        );
        const x = rand();
        const status = lv.length ? "on_leave" : x < 0.92 ? "present" : x < 0.97 ? "late" : "absent";
        await db.query(
          "insert into public.staff_attendance (staff_id, att_date, status, marked_by, is_demo) values ($1, $2, $3, $4, true)",
          [st.id, day, status, adminId],
        );
        staffRows++;
      }
    }
    if (dry) {
      const { rows: q } = await db.query(
        `select (select count(*) from public.attendance_sessions where is_demo) sessions, (select count(*) from public.student_attendance where is_demo) rows,
                (select count(*) from public.leave_requests where is_demo) leave, (select count(*) from public.staff_attendance where is_demo) staff_rows`,
      );
      console.log("DRY RUN (rolled back):", q[0]);
      await db.query("rollback");
    }
    console.log(
      `Demo attendance: ${sessionsN} sessions / ${rowsN} student rows over ${days.length} school days (${skipped} sessions left unmarked), ${leaveN} leave requests, ${staffRows} staff attendance rows.`,
    );
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}

export async function wipeDemoAttendance() {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const { rows: has } = await db.query("select to_regclass('public.attendance_sessions') as t");
    if (!has[0].t) return console.log("Attendance tables not found: nothing to wipe.");
    const a = await db.query("delete from public.attendance_sessions where is_demo"); // rows cascade
    const l = await db.query("delete from public.leave_requests where is_demo");
    const s = await db.query("delete from public.staff_attendance where is_demo");
    console.log(`Removed ${a.rowCount} demo sessions (with their student rows), ${l.rowCount} demo leave requests and ${s.rowCount} demo staff attendance rows. Leave types kept.`);
  } finally {
    await db.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2];
  if (cmd === "seed") await seedDemoAttendance();
  else if (cmd === "wipe") {
    if (!process.argv.includes("--yes")) {
      console.error("This deletes the DEMO attendance and demo leave. Re-run with: npm run wipe:demo-attendance -- --yes");
      process.exit(2);
    }
    await wipeDemoAttendance();
  } else {
    console.error("usage: demo-attendance.mjs seed | wipe --yes");
    process.exit(2);
  }
}
