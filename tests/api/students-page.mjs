// The paged Students list through the real API: paging, search, filters and the scope rule. Needs demo data (seed:demo, seed:demo-bulk).
import { createClient } from "@supabase/supabase-js";

export const name = "students_page via the API (Admin, office teacher, teacher1)";

async function signIn(url, anon, email, password) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  return error ? null : c;
}

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, DEMO_USER_PASSWORD: pw } = process.env;
  if (!url || !anon || !service || !pw) return skip("Supabase keys or DEMO_USER_PASSWORD missing in .env.local");
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: yr } = await admin.from("academic_years").select("id").eq("is_current", true).single();
  const { count: total } = await admin.from("students").select("id", { count: "exact", head: true });
  if (!yr || !total) return skip("no demo students (npm run seed:demo, seed:demo-bulk)");
  const { data: t1 } = await admin.from("staff").select("id").eq("employee_code", "DEMO-T01").maybeSingle();

  const args = (o = {}) => ({ p_year: yr.id, p_sort: "name", p_dir: "asc", p_offset: 0, p_limit: 50, ...o });
  const A = await signIn(url, anon, "admin@demo.kchs.test", pw);
  if (!A) return skip("could not sign in as admin");
  try {
    const p1 = await A.rpc("students_page", args());
    ok(!p1.error && p1.data.total === total, `Admin: the total is every student (${total})`, p1.error?.message ?? String(p1.data?.total));
    ok(p1.data.rows.length === Math.min(50, total), "Admin: a page has 50 rows, not all of them");
    const p2 = await A.rpc("students_page", args({ p_offset: 50 }));
    const ids1 = new Set(p1.data.rows.map((r) => r.id));
    ok(p2.data.rows.length > 0 && p2.data.rows.every((r) => !ids1.has(r.id)), "Admin: page 2 has different students");
    const byAdm = await A.rpc("students_page", args({ p_q: "DEMO-BULK-07", p_limit: 250 }));
    const { count: expAdm } = await admin.from("students").select("id", { count: "exact", head: true }).ilike("admission_no", "%DEMO-BULK-07%");
    ok(!byAdm.error && byAdm.data.total === expAdm && expAdm > 0, `Admin: search by admission number finds exactly ${expAdm}`, String(byAdm.data?.total));
    const stud = p1.data.rows[0];
    const bySurname = await A.rpc("students_page", args({ p_q: stud.full_name.split(" ").slice(-1)[0].toUpperCase(), p_limit: 250 }));
    ok(bySurname.data.rows.some((r) => r.id === stud.id), "Admin: search ignores upper / lower case");
    const guardian = stud.guardians?.find((g) => g.phone);
    if (guardian) {
      const byPhone = await A.rpc("students_page", args({ p_q: guardian.phone }));
      ok(byPhone.data.rows.some((r) => r.id === stud.id), "Admin: search by a parent's phone finds the student");
    }
    const cls = await A.rpc("students_page", args({ p_class: stud.classId, p_limit: 250 }));
    ok(cls.data.rows.length > 0 && cls.data.rows.every((r) => r.classId === stud.classId), "Admin: the class filter returns only that class");
    const none = await A.rpc("students_page", args({ p_enrol: "none", p_limit: 250 }));
    ok(!none.error && none.data.rows.every((r) => r.sectionId === null), "Admin: the not-enrolled filter returns only students without a section");
    ok(p1.data.rows.every((r) => typeof r.missingDocsCount === "number" && typeof r.missingGovCount === "number" && !("missingGov" in r) && !("details" in r) && !("masked" in r)), "Admin: the list page carries document / field gap counts but leaves out the heavy government fields");
    const full = await A.rpc("students_page", args({ p_full: true, p_limit: 20 }));
    ok(full.data.rows.every((r) => r.details && r.masked), "Admin: an export request (p_full) carries government fields and masked IDs");
    ok(full.data.rows.every((r) => Object.values(r.masked ?? {}).every((v) => String(v).length <= 4)), "Admin: IDs are only the last 4 characters");
    const chosen = await A.rpc("students_page", args({ p_ids: p1.data.rows.slice(0, 3).map((r) => r.id) }));
    ok(chosen.data.total === 3 && chosen.data.rows.length === 3, "Admin: asking for chosen students returns exactly those");
  } finally {
    await A.auth.signOut();
  }

  // teacher: own sections only, never government fields
  const [{ data: mine }, { data: ct }] = await Promise.all([
    admin.from("teacher_assignments").select("section_id").eq("staff_id", t1.id),
    admin.from("sections").select("id").eq("class_teacher_id", t1.id),
  ]);
  const mySections = [...new Set([...mine.map((a) => a.section_id), ...ct.map((s) => s.id)])];
  const { data: enrol } = await admin.from("student_enrollments").select("student_id").in("section_id", mySections).eq("academic_year_id", yr.id);
  const expected = new Set(enrol.map((e) => e.student_id));
  const T = await signIn(url, anon, "teacher1@demo.kchs.test", pw);
  if (!T) return skip("could not sign in as teacher1");
  try {
    for (const mineFlag of [false, true]) {
      const r = await T.rpc("students_page", args({ p_mine: mineFlag, p_limit: 1000, p_full: true }));
      ok(!r.error && r.data.total === expected.size && r.data.rows.every((x) => expected.has(x.id)), `teacher1 (${mineFlag ? "my students" : "list"}): exactly the ${expected.size} students of their own sections`, r.error?.message ?? String(r.data?.total));
      ok(r.data.rows.every((x) => !("details" in x) && !("masked" in x) && !("missingDocs" in x) && !("missingGov" in x)), `teacher1 (${mineFlag ? "my students" : "list"}): no government fields, masked IDs or document gaps`);
    }
    const { data: other } = await admin.from("student_enrollments").select("student_id, students(full_name)").not("section_id", "in", `(${mySections.join(",")})`).limit(1);
    const other1 = other?.[0];
    if (other1) {
      const r = await T.rpc("students_page", args({ p_q: other1.students.full_name }));
      ok(r.data.rows.every((x) => expected.has(x.id)), "teacher1: searching for another section's student by name finds none of theirs");
      const r2 = await T.rpc("students_page", args({ p_docs: "missing", p_gov: "missing", p_limit: 1000 }));
      ok(r2.data.total === expected.size, "teacher1: the document and government-field filters are ignored (no probing of hidden data)");
      const r3 = await T.rpc("students_page", args({ p_enrol: "none", p_limit: 1000 }));
      ok(r3.data.total === 0, "teacher1: the not-enrolled list is empty (they only ever see enrolled students of their sections)");
    }
  } finally {
    await T.auth.signOut();
  }

  // office teacher (student_records duty): everything
  const O = await signIn(url, anon, "office@demo.kchs.test", pw);
  if (!O) return skip("could not sign in as the office teacher");
  try {
    const r = await O.rpc("students_page", args({ p_limit: 5, p_full: true }));
    ok(!r.error && r.data.total === total, `office teacher (student_records): all ${total} students`, r.error?.message);
    ok(r.data.rows.every((x) => "details" in x && "masked" in x), "office teacher: government fields and masked IDs");
  } finally {
    await O.auth.signOut();
  }
}
