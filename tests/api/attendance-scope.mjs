// Attendance scope through the real Supabase API (demo logins).
// Skips until the attendance migration is applied and demo attendance is seeded.
import { createClient } from "@supabase/supabase-js";

export const name = "attendance: who sees which sessions (demo logins via the API)";

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, DEMO_USER_PASSWORD: pw } = process.env;
  if (!url || !anon || !service || !pw) return skip("Supabase keys or DEMO_USER_PASSWORD missing in .env.local");
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const probe = await admin.from("attendance_sessions").select("id", { head: true, count: "exact" });
  if (probe.error || !probe.count) return skip("attendance migration not applied / demo attendance not seeded");

  const { data: t1 } = await admin.from("staff").select("id").eq("employee_code", "DEMO-T01").single();
  const { data: mySections } = await admin.from("sections").select("id").eq("class_teacher_id", t1.id);
  const ctIds = new Set((mySections ?? []).map((s) => s.id));
  const { data: all } = await admin.from("attendance_sessions").select("id, section_id, assigned_to, marked_by").limit(5000);
  const expected = all.filter((s) => s.assigned_to === t1.id || s.marked_by === t1.id || ctIds.has(s.section_id));

  async function login(email) {
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email, password: pw });
    if (error) throw new Error(`sign-in ${email}: ${error.message}`);
    return c;
  }

  const teacher = await login("teacher1@demo.kchs.test");
  const { data: seen } = await teacher.from("attendance_sessions").select("id").limit(5000);
  const exp = new Set(expected.map((s) => s.id));
  ok(seen.length === exp.size && seen.every((s) => exp.has(s.id)), `API: teacher1 sees exactly their ${exp.size} sessions (assigned, marked or class teacher)`, `got ${seen.length}`);
  ok(seen.length < all.length, "API: teacher1 does not see every session");
  const { data: rows } = await teacher.from("student_attendance").select("id, session_id").limit(5000);
  ok(rows.every((r) => exp.has(r.session_id)), "API: teacher1 sees student rows only of their sessions");
  const { error: insErr } = await teacher.from("student_attendance").insert({ session_id: seen[0].id, student_id: "00000000-0000-0000-0000-000000000000", status: "present" });
  ok(!!insErr, "API: teacher1 cannot write attendance rows directly", insErr?.message);
  const { error: markErr } = await teacher.rpc("mark_attendance", { p_section: all[0].section_id, p_date: "2020-01-01", p_session: "morning", p_entries: [{ student_id: "00000000-0000-0000-0000-000000000000", status: "present" }] });
  ok(!!markErr, "API: teacher1 cannot mark a past date", markErr?.message);
  const { error: unmErr } = await teacher.rpc("unmarked_sessions", {});
  ok(!!unmErr, "API: teacher1 cannot list every unmarked session");
  const { data: mine, error: mineErr } = await teacher.rpc("my_attendance_sessions", {});
  ok(!mineErr && Array.isArray(mine), "API: teacher1 can list their sessions for today", mineErr?.message);

  const { data: leaveAll } = await admin.from("leave_requests").select("id, staff_id");
  const { data: leaveMine } = await teacher.from("leave_requests").select("id, staff_id");
  ok(leaveMine.every((l) => l.staff_id === t1.id) && leaveMine.length <= leaveAll.length, "API: teacher1 sees only their own leave requests");
  const { data: sa } = await teacher.from("staff_attendance").select("staff_id");
  ok(sa.length > 0 && sa.every((r) => r.staff_id === t1.id), "API: teacher1 sees only their own staff attendance");

  const adm = await login("admin@demo.kchs.test");
  const { data: admSeen } = await adm.from("attendance_sessions").select("id").limit(5000);
  ok(admSeen.length === all.length, `API: admin sees all ${all.length} sessions`, `got ${admSeen.length}`);
  const { data: unm, error: unmAdmErr } = await adm.rpc("unmarked_sessions", {});
  ok(!unmAdmErr && Array.isArray(unm), "API: admin can list unmarked sessions", unmAdmErr?.message);
  const { data: lv } = await adm.from("leave_requests").select("id");
  ok(lv.length === leaveAll.length, "API: admin sees every leave request");
  const { error: decErr } = await teacher.rpc("decide_leave", { p_id: leaveAll[0].id, p_approve: true });
  ok(!!decErr, "API: teacher1 cannot approve leave");
}
