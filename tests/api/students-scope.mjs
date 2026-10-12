// Students: scope rule + ID protection through the real Supabase API (the
// path the screens use). Read-only. Needs demo data (seed:demo).
import { createClient } from "@supabase/supabase-js";

export const name = "students via the API (teacher1, office teacher)";

async function signIn(url, anon, email, password) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  return error ? null : c;
}

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, DEMO_USER_PASSWORD: pw } = process.env;
  if (!url || !anon || !service || !pw) return skip("Supabase keys or DEMO_USER_PASSWORD missing in .env.local");
  const admin = createClient(url, service, { auth: { persistSession: false } });

  const { data: t1 } = await admin.from("staff").select("id").eq("employee_code", "DEMO-T01").maybeSingle();
  const { count: total } = await admin.from("students").select("id", { count: "exact", head: true });
  if (!t1 || !total) return skip("demo staff/students not loaded (npm run seed:demo)");

  // ground truth: students enrolled in a section teacher1 teaches (class teacher or assigned)
  const [{ data: mine }, { data: ct }] = await Promise.all([
    admin.from("teacher_assignments").select("section_id").eq("staff_id", t1.id),
    admin.from("sections").select("id").eq("class_teacher_id", t1.id),
  ]);
  const mySections = [...new Set([...mine.map((a) => a.section_id), ...ct.map((s) => s.id)])];
  const { data: myEnrol } = await admin.from("student_enrollments").select("student_id").in("section_id", mySections);
  const expected = new Set(myEnrol.map((e) => e.student_id));
  const { data: anyOther } = await admin.from("student_enrollments").select("student_id").not("section_id", "in", `(${mySections.join(",")})`).limit(1);

  const teacher = await signIn(url, anon, "teacher1@demo.kchs.test", pw);
  if (!teacher) return skip("could not sign in as teacher1");
  try {
    const { data: studs } = await teacher.from("students").select("id");
    ok(studs.length === expected.size && studs.every((s) => expected.has(s.id)), `API teacher1: sees exactly own sections' students (${expected.size} of ${total})`, `got ${studs.length}`);
    if (anyOther?.[0]) {
      const { data } = await teacher.from("students").select("id").eq("id", anyOther[0].student_id);
      ok(data.length === 0, "API teacher1: another section's student by id returns nothing");
    }
    const { data: prof } = await teacher.from("student_profiles").select("student_id");
    ok(prof.length === 0, "API teacher1: no government fields");
    const { data: masked } = await teacher.from("student_secure_values").select("student_id, value_last4");
    ok(masked.length === 0, "API teacher1: no IDs, not even masked");
    const { error: revealErr } = await teacher.rpc("reveal_student_secure_values", { p_student_id: [...expected][0] });
    ok(!!revealErr, "API teacher1: cannot reveal Aadhaar");
    const { data: g } = await teacher.from("guardians").select("phone, address").limit(5);
    ok(g.length > 0 && g.every((x) => x.phone), "API teacher1: sees guardian phone and address of own students");
    const { data: docs } = await teacher.from("student_documents").select("id");
    ok(docs.length === 0, "API teacher1: no documents");
  } finally {
    await teacher.auth.signOut();
  }

  const office = await signIn(url, anon, "office@demo.kchs.test", pw);
  if (!office) return skip("could not sign in as office teacher");
  try {
    const { count } = await office.from("students").select("id", { count: "exact", head: true });
    ok(count === total, `API office teacher (student_records): sees all ${total} students`, `got ${count}`);
    const { data: masked } = await office.from("student_secure_values").select("value_last4").eq("field_key", "aadhaar_no").limit(3);
    ok(masked.length > 0 && masked.every((m) => /^\d{4}$/.test(m.value_last4)), "API office teacher: sees masked Aadhaar (last 4)");
    const { error: encErr } = await office.from("student_secure_values").select("value_enc").limit(1);
    ok(!!encErr, "API office teacher: encrypted column is not readable");
    const { data: any } = await office.from("students").select("id").limit(1);
    const { error: revealErr } = await office.rpc("reveal_student_secure_values", { p_student_id: any[0].id });
    ok(!!revealErr, "API office teacher: cannot reveal full Aadhaar (needs government_ids_view)");
    const { error: delErr, count: delCount } = await office.from("students").delete({ count: "exact" }).eq("id", any[0].id);
    ok(!delErr && delCount === 0, "API office teacher: cannot delete a student");
    const { error: statusErr } = await office.from("students").update({ status: "left" }).eq("id", any[0].id);
    ok(!!statusErr, "API office teacher: cannot change status");
  } finally {
    await office.auth.signOut();
  }
}
