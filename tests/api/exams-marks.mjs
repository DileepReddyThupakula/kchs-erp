// Exams & marks through the real Supabase API (demo logins): teacher scope (R18), simultaneous entry, locked exams.
// Needs the exams migration and `npm run seed:demo-exams`; it skips otherwise. It writes SA2 marks of one demo class and removes them again.
import { createClient } from "@supabase/supabase-js";

export const name = "exams & marks: scope, simultaneous entry and locks (demo logins via the API)";

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, DEMO_USER_PASSWORD: pw } = process.env;
  if (!url || !anon || !service || !pw) return skip("Supabase keys or DEMO_USER_PASSWORD missing in .env.local");
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const probe = await admin.from("exam_components").select("id", { count: "exact", head: true }).eq("is_demo", true);
  if (probe.error || !probe.count) return skip("exams migration not applied / demo exams not seeded");
  const login = async (email) => {
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email, password: pw });
    if (error) throw new Error(`sign-in ${email}: ${error.message}`);
    return c;
  };
  const { data: t1 } = await admin.from("staff").select("id").eq("employee_code", "DEMO-T01").single();
  const { data: t2 } = await admin.from("staff").select("id").eq("employee_code", "DEMO-T02").single();
  const { data: a1 } = await admin.from("teacher_assignments").select("section_id, subject_id").eq("staff_id", t1.id);
  const { data: a2 } = await admin.from("teacher_assignments").select("section_id, subject_id").eq("staff_id", t2.id);
  const { data: demoSecs } = await admin.from("exam_components").select("class_id").eq("is_demo", true);
  const demoClasses = new Set(demoSecs.map((c) => c.class_id));
  const { data: secs } = await admin.from("sections").select("id, class_id");
  const classOf = new Map(secs.map((s) => [s.id, s.class_id]));
  const { data: subs } = await admin.from("subjects").select("id, type");
  const scholastic = new Set(subs.filter((s) => s.type === "scholastic").map((s) => s.id));
  const pair = a1.flatMap((x) => a2.filter((y) => y.section_id === x.section_id && y.subject_id !== x.subject_id && scholastic.has(x.subject_id) && scholastic.has(y.subject_id) && demoClasses.has(classOf.get(x.section_id))).map((y) => ({ section: x.section_id, s1: x.subject_id, s2: y.subject_id })))[0];
  if (!pair) return skip("no demo section with two scholastic subjects for teacher1 and teacher2");
  const classId = classOf.get(pair.section);
  const { data: sa2 } = await admin.from("exam_components").select("id, locked_at").eq("class_id", classId).eq("name", "SA2").single();
  const { data: sa1 } = await admin.from("exam_components").select("id, locked_at").eq("class_id", classId).eq("name", "SA1").single();
  const { data: en } = await admin.from("student_enrollments").select("student_id").eq("section_id", pair.section).eq("status", "active").limit(2);
  if (en.length < 2) return skip("the demo section has fewer than two students");
  const [s1, s2] = en.map((e) => e.student_id);
  const T1 = await login("teacher1@demo.kchs.test");
  const T2 = await login("teacher2@demo.kchs.test");
  const OFF = await login("office@demo.kchs.test"); // has all_class_marks? (see below)
  const ADM = await login("admin@demo.kchs.test");
  const clean = () => admin.from("marks").delete().eq("component_id", sa2.id).in("student_id", [s1, s2]);
  await clean();
  try {
    ok(!sa2.locked_at && !!sa1.locked_at, "SA2 is open and SA1 (Term 1) is locked in the demo class");
    const rows = (v) => [{ student_id: s1, status: "marked", marks: v }, { student_id: s2, status: "absent" }];
    const [r1, r2] = await Promise.all([T1.rpc("save_marks", { p_component: sa2.id, p_section: pair.section, p_subject: pair.s1, p_rows: rows(55) }), T2.rpc("save_marks", { p_component: sa2.id, p_section: pair.section, p_subject: pair.s2, p_rows: rows(61) })]);
    ok(!r1.error && !r2.error, "two teachers enter marks for two subjects of the same class at the same moment: both succeed", r1.error?.message ?? r2.error?.message);
    const { data: m } = await admin.from("marks").select("subject_id, student_id, status, marks").eq("component_id", sa2.id).in("student_id", [s1, s2]);
    ok(m.length === 4, "...and the four rows exist, one per student and subject", String(m.length));
    const [x1, x2] = await Promise.all([T1.rpc("save_marks", { p_component: sa2.id, p_section: pair.section, p_subject: pair.s1, p_rows: rows(40) }), T1.rpc("save_marks", { p_component: sa2.id, p_section: pair.section, p_subject: pair.s1, p_rows: rows(42) })]);
    ok(!x1.error && !x2.error, "the same teacher saving the same mark twice at once: both succeed", x1.error?.message ?? x2.error?.message);
    const { data: m2 } = await admin.from("marks").select("id").eq("component_id", sa2.id).eq("student_id", s1).eq("subject_id", pair.s1);
    ok(m2.length === 1, "...and there is still exactly one row for that student, exam and subject", String(m2.length));
    const { data: res } = await admin.from("subject_results").select("scored, max_marks").eq("student_id", s1).eq("subject_id", pair.s1);
    ok(res.length > 0, "results were calculated by the database (no one typed a total)");

    // a changed mark refreshes the result at once (the totals the teacher sees), and only the results that contain that exam
    const { data: t2 } = await admin.from("result_groups").select("id").eq("class_id", classId).eq("name", "Term 2").single();
    const { data: t1g } = await admin.from("result_groups").select("id").eq("class_id", classId).eq("name", "Term 1").single();
    const total = async (g) => (await T1.from("subject_results").select("scored").eq("student_id", s1).eq("subject_id", pair.s1).eq("group_id", g)).data?.[0]?.scored;
    const before2 = Number(await total(t2.id));
    const before1 = Number(await total(t1g.id));
    const stored = Number((await admin.from("marks").select("marks").eq("component_id", sa2.id).eq("student_id", s1).eq("subject_id", pair.s1).single()).data.marks); // 40 or 42: the two simultaneous saves above race
    const chg = await T1.rpc("save_marks", { p_component: sa2.id, p_section: pair.section, p_subject: pair.s1, p_rows: [{ student_id: s1, status: "marked", marks: 10 }] });
    const after2 = Number(await total(t2.id));
    ok(!chg.error && after2 === before2 - (stored - 10), "after saving a new SA2 mark the Term 2 total the teacher reads has changed by the difference", `${before2} -> ${after2}`);
    ok(Number(await total(t1g.id)) === before1, "and the Term 1 total (which does not contain SA2) is untouched");
    // the scheme as the pages read it (members through their group): a teacher of the class sees it, so totals can be shown
    const mem = await T1.from("result_group_members").select("id, group_id, component_id, child_group_id, result_groups!group_id!inner(class_id)").eq("result_groups.class_id", classId);
    ok(!mem.error && (mem.data ?? []).length >= 6, "a teacher of the class reads the scheme's members (what the totals are built from)", mem.error?.message ?? String(mem.data?.length));

    // scope
    const wrong = await T1.rpc("save_marks", { p_component: sa2.id, p_section: pair.section, p_subject: pair.s2, p_rows: rows(10) });
    ok(!!wrong.error, "teacher1 cannot enter marks for teacher2's subject", wrong.error?.message);
    const seen = await T1.from("marks").select("subject_id").eq("section_id", pair.section);
    ok(seen.data.length > 0 && seen.data.every((x) => a1.some((a) => a.section_id === pair.section && a.subject_id === x.subject_id)), "teacher1 sees only the marks of subjects they teach");
    const tot = await T1.from("student_results").select("id", { count: "exact", head: true });
    ok(!tot.error && tot.count === 0, "teacher1 cannot read overall student results");
    const direct = await T1.from("marks").update({ marks: 1 }).eq("component_id", sa2.id).select();
    ok(!direct.error && (direct.data ?? []).length === 0, "a direct update of marks changes nothing");
    const ins = await T1.from("marks").insert({ academic_year_id: "00000000-0000-4000-8000-000000000000", class_id: classId, section_id: pair.section, student_id: s1, component_id: sa2.id, subject_id: pair.s1, status: "marked", marks: 1 });
    ok(!!ins.error, "a direct insert into marks is refused", ins.error?.message);
    const sch = await T1.rpc("save_exam_component", { p: { academic_year_id: "00000000-0000-4000-8000-000000000000", class_id: classId, name: "Hack", max_marks: 10 } });
    ok(!!sch.error, "a teacher cannot create exams", sch.error?.message);
    const lk = await T1.rpc("lock_exam_component", { p_component: sa2.id });
    ok(!!lk.error, "a teacher cannot lock", lk.error?.message);

    // locks
    const locked = await ADM.rpc("save_marks", { p_component: sa1.id, p_section: pair.section, p_subject: pair.s1, p_rows: rows(10) });
    ok(!!locked.error && /locked/i.test(locked.error.message), "Admin cannot change a locked exam's marks", locked.error?.message);
    const lockedT = await T1.rpc("save_marks", { p_component: sa1.id, p_section: pair.section, p_subject: pair.s1, p_rows: rows(10) });
    ok(!!lockedT.error, "nor can the teacher", lockedT.error?.message);
    const noReason = await ADM.rpc("unlock_exam_component", { p_component: sa1.id, p_reason: "" });
    ok(!!noReason.error, "unlocking needs a reason");
    const card = await T2.rpc("report_card_data", { p_student: s1, p_group: (await admin.from("result_groups").select("id").eq("class_id", classId).eq("name", "Term 1").single()).data.id });
    const isCt = secs && (await admin.from("sections").select("class_teacher_id").eq("id", pair.section).single()).data.class_teacher_id === t2.id;
    ok(isCt ? !card.error : !!card.error, isCt ? "teacher2 is the class teacher: can open their own student's report card (locked term)" : "a subject teacher cannot open a report card", card.error?.message);
    const cardT1 = await T1.rpc("report_card_data", { p_student: s1, p_group: (await admin.from("result_groups").select("id").eq("class_id", classId).eq("name", "Term 1").single()).data.id });
    ok(isCt ? !!cardT1.error : true, "teacher1 (not the class teacher) cannot open it");
    void OFF;
  } finally {
    await clean();
  }
}
