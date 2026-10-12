// Teacher scope rule, checked through the real Supabase API (the same path
// the app's screens use): sign in as the demo teacher and compare what comes
// back with what they should see. Read-only. Needs demo data (seed:demo).
import { createClient } from "@supabase/supabase-js";

export const name = "teacher scope via the API (demo teacher1)";

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, DEMO_USER_PASSWORD: pw } = process.env;
  if (!url || !anon || !service || !pw) return skip("Supabase keys or DEMO_USER_PASSWORD missing in .env.local");

  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: me } = await admin.from("staff").select("id").eq("employee_code", "DEMO-T01").maybeSingle();
  if (!me) return skip("demo data not loaded (npm run seed:demo)");

  // Ground truth, computed with the service key
  const [{ data: allSections }, { data: mine }, { data: ct }] = await Promise.all([
    admin.from("sections").select("id, class_id"),
    admin.from("teacher_assignments").select("id, section_id, subject_id").eq("staff_id", me.id),
    admin.from("sections").select("id").eq("class_teacher_id", me.id),
  ]);
  const expectedSections = new Set([...mine.map((a) => a.section_id), ...ct.map((s) => s.id)]);
  const expectedSubjects = new Set(mine.map((a) => a.subject_id));
  const other = allSections.find((s) => !expectedSections.has(s.id));

  // Sign in as the teacher with the public anon key, like the browser does
  const teacher = createClient(url, anon, { auth: { persistSession: false } });
  const { error: authErr } = await teacher.auth.signInWithPassword({ email: "teacher1@demo.kchs.test", password: pw });
  if (authErr) return skip(`could not sign in as teacher1: ${authErr.message}`);

  try {
    const { data: secs } = await teacher.from("sections").select("id");
    const seen = new Set(secs.map((s) => s.id));
    ok(seen.size === expectedSections.size && [...seen].every((id) => expectedSections.has(id)),
      `API: teacher sees exactly own sections (${expectedSections.size} of ${allSections.length})`, `got ${seen.size}`);

    if (other) {
      const { data } = await teacher.from("sections").select("id").eq("id", other.id);
      ok(data.length === 0, "API: asking for another section by id returns nothing");
    }

    const { data: subs } = await teacher.from("subjects").select("id");
    ok(subs.length === expectedSubjects.size && subs.every((s) => expectedSubjects.has(s.id)), `API: teacher sees only the ${expectedSubjects.size} subject(s) they teach`, `got ${subs.length}`);

    const { data: tas } = await teacher.from("teacher_assignments").select("id, staff_id");
    ok(tas.length === mine.length && tas.every((a) => a.staff_id === me.id), "API: teacher sees only own assignments", `got ${tas.length}`);

    const { data: links } = await teacher.from("class_subjects").select("subject_id");
    ok(links.every((l) => expectedSubjects.has(l.subject_id)), "API: class-subject links only for subjects they teach");

    const expectedClasses = new Set(allSections.filter((s) => expectedSections.has(s.id)).map((s) => s.class_id));
    const { data: cls } = await teacher.from("classes").select("id");
    ok(cls.length === expectedClasses.size && cls.every((c) => expectedClasses.has(c.id)), "API: class names only for own sections", `got ${cls.length}`);

    const { data: dir } = await teacher.rpc("staff_directory");
    ok(dir.length <= expectedSections.size + 1, "API: staff directory limited to self + own sections' class teachers", `got ${dir.length}`);

    const { data: staffRows } = await teacher.from("staff").select("id");
    ok(staffRows.length === 1 && staffRows[0].id === me.id, "API: teacher reads only own staff record");

    const { data: settings } = await teacher.from("school_settings").select("id");
    ok(settings.length === 1, "API: teacher still reads school settings");
  } finally {
    await teacher.auth.signOut();
  }
}
