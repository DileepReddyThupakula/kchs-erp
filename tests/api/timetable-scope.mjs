// Timetable scope through the real Supabase API (demo logins). Read-mostly.
// Skips until the timetable migration is applied and the demo timetable is seeded.
import { createClient } from "@supabase/supabase-js";

export const name = "timetable: who sees which periods (demo logins via the API)";

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, DEMO_USER_PASSWORD: pw } = process.env;
  if (!url || !anon || !service || !pw) return skip("Supabase keys or DEMO_USER_PASSWORD missing in .env.local");
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const probe = await admin.from("timetable_entries").select("id", { head: true, count: "exact" });
  if (probe.error) return skip("timetable migration not applied yet");
  if (!probe.count) return skip("demo timetable not seeded (npm run seed:demo-timetable)");

  const { data: t1 } = await admin.from("staff").select("id").eq("employee_code", "DEMO-T01").single();
  const { data: t2 } = await admin.from("staff").select("id").eq("employee_code", "DEMO-T02").single();
  const { count: mine } = await admin.from("timetable_entries").select("id", { head: true, count: "exact" }).eq("teacher_id", t1.id);

  async function login(email) {
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email, password: pw });
    if (error) throw new Error(`sign-in ${email}: ${error.message}`);
    return c;
  }

  const teacher = await login("teacher1@demo.kchs.test");
  const { data: rows } = await teacher.from("timetable_entries").select("id, teacher_id");
  ok(rows.length === mine && rows.every((r) => r.teacher_id === t1.id), `API: teacher1 sees exactly their own ${mine} periods`, `got ${rows.length}`);
  const { data: others } = await teacher.from("timetable_entries").select("id").eq("teacher_id", t2.id);
  ok(others.length === 0, "API: teacher1 cannot read another teacher's periods by asking for them");
  const { data: act } = await teacher.from("timetable_entries").select("id").is("teacher_id", null);
  ok(act.length === 0, "API: teacher1 cannot see teacherless activity periods");
  const { error: insErr } = await teacher.from("timetable_entries").insert({ section_id: (await admin.from("sections").select("id").limit(1).single()).data.id, weekday: 1, period_no: 1, activity: "Free" });
  ok(!!insErr, "API: teacher1 cannot create timetable entries", insErr?.message);
  const { data: bell } = await teacher.from("bell_periods").select("id");
  ok(bell.length >= 8, "API: teacher1 can read bell times");
  const { error: bellErr, data: bellUpd } = await teacher.from("bell_periods").update({ label: "X" }).neq("label", "__none__").select("id");
  ok(!bellErr && (bellUpd?.length ?? 0) === 0, "API: teacher1 cannot change bell times");
  const { data: wk, error: wkErr } = await teacher.rpc("my_week", { p_week_start: new Date().toISOString().slice(0, 10) });
  ok(!wkErr && (wk ?? []).length >= 0, "API: teacher1 can read their own week", wkErr?.message);
  const { error: freeErr } = await teacher.rpc("free_teachers", { p_date: new Date().toISOString().slice(0, 10), p_period: 1 });
  ok(!!freeErr, "API: teacher1 cannot ask for the free-teacher list");

  const office = await login("office@demo.kchs.test");
  const { data: officeRows } = await office.from("timetable_entries").select("id");
  ok(officeRows.length === 0, "API: office teacher (fee + student duties, no timetable duty) sees no timetable entries");

  const adm = await login("admin@demo.kchs.test");
  const { count: all } = await admin.from("timetable_entries").select("id", { head: true, count: "exact" });
  const { data: admRows } = await adm.from("timetable_entries").select("id").limit(2000);
  ok(admRows.length === all, `API: admin sees all ${all} entries`, `got ${admRows.length}`);
  const { data: free, error: admFreeErr } = await adm.rpc("free_teachers", { p_date: "2026-10-15", p_period: 1 });
  ok(!admFreeErr && free.length > 0, "API: admin gets the free-teacher list", admFreeErr?.message);
}
