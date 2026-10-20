// DEMO exams and marks (all dummy): Classes 6 to 10, section A of the current year.
// The starting scheme (FA1-FA4 out of 20, SA1/SA2 out of 80; each term = FA scaled to 20 + SA = 100; final = 200)
// is applied through the real Admin function; Term 1 marks are entered for every student (a few Absent / Not applicable),
// with co-scholastic grades and a class-teacher remark, then Term 1 is LOCKED. Term 2: FA3 only, left unlocked.
//   npm run seed:demo-exams            (skips if demo exams exist; takes a minute or two)
//   npm run wipe:demo-exams -- --yes   (removes ONLY the demo exams, marks, results, grades and remarks)
// Needs DATABASE_URL and the demo logins (seed:demo).
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import pg from "pg";
import { assertDevOnly } from "./lib/prod-guard.mjs";
assertDevOnly("demo-exams.mjs");

const CLASSES = ["Class 6", "Class 7", "Class 8", "Class 9", "Class 10"];
const EXTRA_PER_SECTION = 10; // dummy students added so the marks and report cards look realistic (all is_demo, admission no DEMO-EX-...)
const SURNAMES = ["Gandluri", "Pasupuleti", "Kommu", "Bandi", "Chinthala", "Dasari", "Kalluri", "Mandla", "Nallapu", "Pothula", "Ramireddy", "Talari", "Vemula", "Gajjala", "Kuruva", "Madduri", "Shaik", "Syed", "Seelam", "Boya"];
const BOYS = ["Arjun", "Charan", "Karthik", "Sai Kiran", "Venkatesh", "Mahesh", "Ravi Teja", "Nikhil", "Praveen", "Harsha", "Sandeep", "Vamsi", "Abhiram", "Tarun", "Rohith"];
const GIRLS = ["Ananya", "Bhavya", "Deepika", "Harika", "Keerthi", "Lahari", "Meghana", "Navya", "Pooja", "Sahithi", "Sravya", "Tejaswini", "Varshini", "Yamini", "Akshaya"];

// deterministic pseudo random so a re-seed gives the same marks
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export async function seedDemoExams() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL must be set (.env.local)");
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  const dry = process.env.DRY_RUN === "1"; // with TEST_PRE_MIGRATION=<file>: try the seed inside a transaction that is rolled back
  try {
    if (dry) {
      await db.query("begin");
      if (process.env.TEST_PRE_MIGRATION) await db.query(readFileSync(process.env.TEST_PRE_MIGRATION, "utf8"));
    }
    const { rows: has } = await db.query("select to_regclass('public.exam_components') as t");
    if (!has[0].t) return console.log("Exam tables not found: apply the exams migration first.");
    const { rows: done } = await db.query("select count(*)::int n from public.exam_components where is_demo");
    if (done[0].n > 0) return console.log(`Demo exams already present (${done[0].n} exams). Wipe first to reseed.`);
    const { rows: y } = await db.query("select id from public.academic_years where is_current");
    if (!y.length) throw new Error("No current academic year");
    const year = y[0].id;
    const { rows: adm } = await db.query("select user_id from public.staff where employee_code = 'DEMO-ADM' and user_id is not null");
    if (!adm.length) throw new Error("Demo admin login missing (run seed:demo)");
    const as = async (fn) => {
      await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: adm[0].user_id, role: "authenticated" })]);
      try {
        return await fn();
      } finally {
        await db.query("select set_config('request.jwt.claims', '', false)").catch(() => {});
      }
    };
    const { rows: secs } = await db.query(
      `select s.id section_id, s.class_id, c.name cls from public.sections s join public.classes c on c.id = s.class_id
        where s.academic_year_id = $1 and c.name = any($2::text[]) order by c.sort_order`,
      [year, CLASSES],
    );
    const bank = (await db.query("select id from public.remark_bank where is_active order by sort_order")).rows.map((r) => r.id);
    let total = 0;
    for (const sec of secs) {
      await as(() => db.query("select public.apply_default_scheme($1, $2)", [year, sec.class_id]));
      await db.query("update public.exam_components set is_demo = true where academic_year_id = $1 and class_id = $2", [year, sec.class_id]);
      await db.query("update public.result_groups set is_demo = true where academic_year_id = $1 and class_id = $2", [year, sec.class_id]);
      const comps = Object.fromEntries((await db.query("select name, id, max_marks from public.exam_components where class_id = $1 and academic_year_id = $2", [sec.class_id, year])).rows.map((c) => [c.name, c]));
      const groups = Object.fromEntries((await db.query("select name, id from public.result_groups where class_id = $1 and academic_year_id = $2", [sec.class_id, year])).rows.map((g) => [g.name, g.id]));
      // more dummy students for this section (flagged demo, so wipe:demo-students removes them too)
      const have = (await db.query("select count(*)::int n, coalesce(max(roll_no), 0)::int mx from public.student_enrollments where section_id = $1", [sec.section_id])).rows[0];
      const clsNo = String(sec.cls).replace(/\D/g, "").padStart(2, "0");
      for (let i = 1; i <= EXTRA_PER_SECTION; i++) {
        const girl = i % 2 === 0;
        const name = `${(girl ? GIRLS : BOYS)[(i * 3 + Number(clsNo)) % 15]} ${SURNAMES[(i * 7 + Number(clsNo) * 3) % SURNAMES.length]}`;
        const adm = `DEMO-EX-${clsNo}-${String(i).padStart(2, "0")}`;
        const { rows: st } = await db.query(
          `insert into public.students (admission_no, full_name, gender, date_of_birth, admission_date, is_demo)
           values ($1, $2, $3, $4, $5, true) returning id`,
          [adm, name, girl ? "female" : "male", `${2026 - 5 - Number(clsNo)}-0${(i % 9) + 1}-1${i % 9}`, "2020-06-01"],
        );
        await db.query("insert into public.student_enrollments (student_id, academic_year_id, section_id, roll_no) values ($1, $2, $3, $4)", [st[0].id, year, sec.section_id, have.mx + i]);
      }
      const students = (await db.query("select student_id from public.student_enrollments where section_id = $1 and status = 'active' order by roll_no nulls last, student_id", [sec.section_id])).rows.map((r) => r.student_id);
      const subjects = (await db.query(
        `select cs.subject_id, s.type from public.class_subjects cs join public.subjects s on s.id = cs.subject_id where cs.academic_year_id = $1 and cs.class_id = $2 order by cs.sort_order`,
        [year, sec.class_id],
      )).rows;
      const marksSubjects = subjects.filter((s) => s.type === "scholastic");
      const cosc = subjects.filter((s) => s.type === "co_scholastic");
      const rand = rng(sec.cls.length * 7919 + students.length);
      const ability = new Map(students.map((id) => [id, 0.35 + rand() * 0.6])); // each student's general level
      for (const name of ["FA1", "FA2", "SA1", "FA3"]) {
        const c = comps[name];
        for (const sub of marksSubjects) {
          const rows = students.map((sid) => {
            const r = rand();
            if (name !== "FA3" && r < 0.012) return { student_id: sid, status: "absent" };
            if (name !== "FA3" && r > 0.99) return { student_id: sid, status: "na" };
            const pct = Math.min(1, Math.max(0.05, ability.get(sid) + (rand() - 0.5) * 0.35));
            const m = Math.round(pct * Number(c.max_marks) * 2) / 2; // halves
            return { student_id: sid, status: "marked", marks: Math.min(m, Number(c.max_marks)) };
          });
          await as(() => db.query("select public.save_marks($1, $2, $3, $4::jsonb)", [c.id, sec.section_id, sub.subject_id, JSON.stringify(rows)]));
          total += rows.length;
        }
      }
      for (const sub of cosc) {
        const rows = students.map((sid) => ({ student_id: sid, grade: ["A", "B", "B", "C", "A", "D"][Math.floor(rand() * 6)] }));
        await as(() => db.query("select public.save_grades($1, $2, $3, $4::jsonb)", [groups["Term 1"], sec.section_id, sub.subject_id, JSON.stringify(rows)]));
      }
      let i = 0;
      for (const sid of students) {
        await as(() => db.query("select public.save_report_remark($1, $2, $3, null, null)", [groups["Term 1"], sid, bank[i++ % bank.length]]));
      }
      await db.query("update public.grade_entries set is_demo = true where class_id = $1 and academic_year_id = $2", [sec.class_id, year]);
      await db.query("update public.report_remarks set is_demo = true where class_id = $1 and academic_year_id = $2", [sec.class_id, year]);
      await db.query("update public.marks set is_demo = true where class_id = $1 and academic_year_id = $2", [sec.class_id, year]); // before the lock: locked marks cannot change
      await as(() => db.query("select public.lock_result_group($1)", [groups["Term 1"]]));
      console.log(`${sec.cls}: ${students.length} students, ${marksSubjects.length} marks subjects, Term 1 locked.`);
    }
    if (dry) {
      const { rows: q } = await db.query(
        `select (select count(*) from public.marks where is_demo)::int marks, (select count(*) from public.subject_results)::int subject_results,
                (select count(*) from public.student_results)::int student_results, (select count(*) from public.student_results where result = 'pass')::int pass,
                (select count(*) from public.student_results where result = 'fail')::int fail, (select count(*) from public.student_results where result = 'incomplete')::int incomplete,
                (select count(*) from public.report_remarks)::int remarks, (select count(*) from public.grade_entries)::int grades`,
      );
      console.log("DRY RUN (rolled back):", q[0]);
      await db.query("rollback");
    }
    console.log(`Demo exams: ${secs.length} classes, about ${total} marks. Term 1 is locked (report cards can be printed); Term 2 has FA3 only.`);
  } finally {
    await db.end();
  }
}

export async function wipeDemoExams() {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await db.connect();
  try {
    const { rows: has } = await db.query("select to_regclass('public.exam_components') as t");
    if (!has[0].t) return console.log("Exam tables not found: nothing to wipe.");
    await db.query("begin");
    await db.query("set local session_replication_role = replica"); // no triggers: nothing is recalculated while deleting
    const c = await db.query("select count(*)::int n from public.marks where is_demo or component_id in (select id from public.exam_components where is_demo)");
    await db.query("delete from public.report_card_prints where group_id in (select id from public.result_groups where is_demo)");
    await db.query("delete from public.result_groups where is_demo");
    await db.query("delete from public.exam_components where is_demo");
    const st = await db.query("delete from public.students where is_demo and admission_no like 'DEMO-EX-%'"); // the extra dummy students
    console.log(`Removed ${st.rowCount} extra demo students (DEMO-EX-...).`);
    await db.query("commit");
    console.log(`Removed the demo exam scheme and ${c.rows[0].n} demo marks (with results, grades, remarks and print records).`);
  } catch (e) {
    await db.query("rollback").catch(() => {});
    throw e;
  } finally {
    await db.end();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2];
  if (cmd === "seed") await seedDemoExams();
  else if (cmd === "wipe") {
    if (!process.argv.includes("--yes")) {
      console.error("This removes the demo exams and marks. Run with --yes to confirm.");
      process.exit(1);
    }
    await wipeDemoExams();
  } else console.error("Usage: demo-exams.mjs seed | wipe --yes");
}
