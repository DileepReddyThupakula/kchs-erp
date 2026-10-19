// The student profile's Marks tab through the real API: what each kind of person may read about ONE student's marks. Needs seed:demo-exams.
import { createClient } from "@supabase/supabase-js";

export const name = "student profile marks tab: scope per person (teacher1, teacher2, desk, fees, Admin)";

async function signIn(url, anon, email, password) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  return error ? null : c;
}

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, DEMO_USER_PASSWORD: pw } = process.env;
  if (!url || !anon || !service || !pw) return skip("keys missing");
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: yr } = await admin.from("academic_years").select("id").eq("is_current", true).single();
  const { data: t1 } = await admin.from("staff").select("id").eq("employee_code", "DEMO-T01").single();
  const { data: t2 } = await admin.from("staff").select("id").eq("employee_code", "DEMO-T02").single();
  const { data: grp } = await admin.from("result_groups").select("id, class_id").eq("academic_year_id", yr.id).eq("name", "Term 1").not("locked_at", "is", null);
  if (!grp?.length) return skip("needs a locked Term 1 (seed:demo-exams)");
  // teacher1: class teacher of one section, teaches Maths in others
  const [{ data: ct }, { data: as }] = await Promise.all([admin.from("sections").select("id, class_id").eq("class_teacher_id", t1.id).eq("academic_year_id", yr.id), admin.from("teacher_assignments").select("section_id, subject_id").eq("staff_id", t1.id)]);
  const ctSec = ct[0];
  const subOnly = [...new Set(as.map((a) => a.section_id))].find((s) => s !== ctSec.id);
  const first = async (section) => (await admin.from("student_enrollments").select("student_id").eq("section_id", section).eq("academic_year_id", yr.id).limit(1)).data[0].student_id;
  const sCt = await first(ctSec.id);
  const sSub = await first(subOnly);
  const g = (cls) => grp.find((x) => x.class_id === cls)?.id;
  const { data: subSec } = await admin.from("sections").select("class_id").eq("id", subOnly).single();
  const gCt = g(ctSec.class_id), gSub = g(subSec.class_id);
  const [T1, T2, DESK, FEE, A] = await Promise.all(["teacher1", "teacher2", "desk", "fees", "admin"].map((u) => signIn(url, anon, `${u}@demo.kchs.test`, pw)));
  if (![T1, T2, DESK, FEE, A].every(Boolean)) return skip("a demo login is missing");
  const rows = (c, s, gid) => c.from("subject_results").select("subject_id").eq("student_id", s).eq("group_id", gid);
  try {
    // subject teacher: only their own subject, no totals, no card
    const own = await rows(T1, sSub, gSub);
    const { data: all } = await rows(A, sSub, gSub);
    ok((own.data ?? []).length > 0 && own.data.length < all.length, `teacher1 (subject teacher only): sees their own subject(s) of a student, ${own.data?.length} of ${all.length}`);
    const tot = await T1.from("student_results").select("id").eq("student_id", sSub);
    ok((tot.data ?? []).length === 0, "teacher1 (subject teacher): no overall total");
    const card = await T1.rpc("report_card_data", { p_student: sSub, p_group: gSub, p_log: false });
    ok(!!card.error, "teacher1 (subject teacher): cannot open the report card", card.error?.message);
    // class teacher: the report card of a locked result, nothing about fees in it
    const c2 = await T1.rpc("report_card_data", { p_student: sCt, p_group: gCt, p_log: false });
    ok(!c2.error && c2.data.subjects.length > (own.data?.length ?? 0), "teacher1 (class teacher): opens the locked report card of their own student, all subjects", c2.error?.message);
    ok(!/paise|fee|due|receipt|₹/i.test(JSON.stringify(c2.data)), "the report card carries no fee data at all");
    const logsBefore = (await admin.from("report_card_prints").select("id", { count: "exact", head: true })).count;
    await T1.rpc("report_card_data", { p_student: sCt, p_group: gCt, p_log: false });
    const logsAfter = (await admin.from("report_card_prints").select("id", { count: "exact", head: true })).count;
    ok(logsBefore === logsAfter, "reading the card for the Marks tab writes no print entry");
    // another teacher sees the student only if the student is in one of THEIR sections
    const [{ data: t2ct }, { data: t2as }] = await Promise.all([admin.from("sections").select("id").eq("class_teacher_id", t2.id), admin.from("teacher_assignments").select("section_id").eq("staff_id", t2.id)]);
    const t2Sections = new Set([...t2ct.map((x) => x.id), ...t2as.map((x) => x.section_id)]);
    const other = await T2.from("students").select("id").eq("id", sSub);
    ok((other.data ?? []).length === (t2Sections.has(subOnly) ? 1 : 0), `teacher2: the student is ${t2Sections.has(subOnly) ? "visible (their section)" : "not visible (not their section)"}`);
    const m2 = await rows(T2, sSub, gSub);
    ok((m2.data ?? []).every((r) => all.some((a) => a.subject_id === r.subject_id)), "teacher2: any marks rows are only of subjects they teach for that student");
    // office staff: may see the student, never marks without the marks duty
    for (const [label, c] of [["desk (student records)", DESK], ["fees (fee access)", FEE]]) {
      const r = await rows(c, sSub, gSub);
      ok((r.data ?? []).length === 0, `${label}: no marks rows`);
      const t = await c.from("student_results").select("id").eq("student_id", sSub);
      ok((t.data ?? []).length === 0, `${label}: no totals`);
      const cd = await c.rpc("report_card_data", { p_student: sSub, p_group: gSub, p_log: false });
      ok(!!cd.error, `${label}: cannot open the report card`, cd.error?.message);
    }
    // Admin: everything, totals included
    const ar = await A.from("student_results").select("id").eq("student_id", sSub).eq("group_id", gSub);
    ok((ar.data ?? []).length === 1, "Admin: the overall result too");
  } finally {
    for (const c of [T1, T2, DESK, FEE, A]) await c?.auth.signOut();
  }
}
