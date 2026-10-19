// Year rollover through the real API: Admin only. Nothing is confirmed here (no demo data is changed).
import { createClient } from "@supabase/supabase-js";

export const name = "year rollover via the API (Admin preview works; teacher1, desk, fees and anonymous refused)";

async function signIn(url, anon, email, password) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  return error ? null : c;
}

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, DEMO_USER_PASSWORD: pw } = process.env;
  if (!url || !anon || !service || !pw) return skip("keys missing");
  const [A, T1, DESK, FEE] = await Promise.all(["admin", "teacher1", "desk", "fees"].map((u) => signIn(url, anon, `${u}@demo.kchs.test`, pw)));
  if (![A, T1, DESK, FEE].every(Boolean)) return skip("a demo login is missing");
  const svc = createClient(url, service, { auth: { persistSession: false } });
  const ANON = createClient(url, anon, { auth: { persistSession: false } });
  const { data: years } = await svc.from("academic_years").select("id, name, is_current, start_date").order("start_date");
  const cur = years?.find((y) => y.is_current);
  if (!cur) return skip("no current year");
  const other = years.find((y) => y.id !== cur.id) ?? cur;
  const calls = [
    ["rollover_preview", { p_from: cur.id, p_to: other.id }],
    ["rollover_confirm", { p_from: cur.id, p_to: other.id, p_plan: {}, p_checked: true, p_typed_name: other.name }],
    ["rollover_undo_check", { p_run: "00000000-0000-4000-8000-000000000000" }],
    ["rollover_undo", { p_run: "00000000-0000-4000-8000-000000000000" }],
    ["rollover_runs_list", {}],
  ];
  const before = JSON.stringify((await svc.from("academic_years").select("id, status, is_current").order("id")).data);
  const p = await A.rpc("rollover_preview", { p_from: cur.id, p_to: other.id });
  ok(!p.error && Array.isArray(p.data?.students) && Array.isArray(p.data?.checklist) && p.data.classes.length > 0, `Admin: preview works on the demo data (${p.data?.students?.length} students, ${p.data?.checklist?.length} checks)`, p.error?.message);
  ok(!p.error && p.data.checklist.some((c) => c.status === "fail") && p.data.can_confirm === false, "Admin: preview of the current year onto itself/another year shows red checks, so it cannot be confirmed by accident");
  const done = Date.now();
  ok(!(await A.rpc("rollover_runs_list")).error, "Admin: the list of rollovers works");
  for (const [who, c] of [["teacher1", T1], ["desk (office, no fee access)", DESK], ["fees (office with fee access)", FEE], ["not signed in", ANON]]) {
    const bad = [];
    for (const [fn, args] of calls) if (!(await c.rpc(fn, args)).error) bad.push(fn);
    ok(bad.length === 0, `${who}: every rollover function is refused`, bad.join(", "));
    const direct = await c.from("rollover_runs").select("id").limit(1);
    ok(!!direct.error || (direct.data ?? []).length === 0, `${who}: reads no rollover records`);
  }
  const bal = await FEE.rpc("previous_year_balance", { p_student: "00000000-0000-4000-8000-000000000000" });
  ok(!bal.error, "fees (office with fee access): may read a previous-year balance");
  ok(!!(await T1.rpc("previous_year_balance", { p_student: "00000000-0000-4000-8000-000000000000" })).error, "teacher1: refused the previous-year balance");
  ok(!!(await DESK.rpc("previous_year_balance", { p_student: "00000000-0000-4000-8000-000000000000" })).error, "desk (no fee access): refused the previous-year balance");
  ok(before === JSON.stringify((await svc.from("academic_years").select("id, status, is_current").order("id")).data), "nothing changed: the years are exactly as before");
  void done;
}
