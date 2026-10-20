// Module 9 audit log through the real API: Admin only, IDs masked, exports logged, entries cannot be changed or removed by anyone.
import { createClient } from "@supabase/supabase-js";

export const name = "audit log via the API (Admin; teacher1, desk, fees, anonymous refused; nobody can edit or delete)";

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
  const calls = [
    ["audit_entries", {}], ["audit_record_history", { p_table: "students", p_record: "x" }], ["audit_actors", {}],
    ["audit_export", { p_format: "csv" }], ["audit_alerts", { p_days: 7 }],
  ];

  // Admin
  const e = await A.rpc("audit_entries", { p_limit: 50 });
  ok(!e.error && Array.isArray(e.data?.rows) && e.data.total >= 1, `Admin: reads the audit entries (${e.data?.total} in the last 7 days)`, e.error?.message);
  const wide = await A.rpc("audit_entries", { p_from: "2020-01-01", p_limit: 500 });
  ok(!wide.error && !/\b[2-9][0-9]{11}\b/.test(JSON.stringify(wide.data).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "")), "Admin: no 12-digit ID number anywhere in the output", wide.error?.message);
  const al = await A.rpc("audit_alerts", { p_days: 7 });
  ok(!al.error && al.data.items.length === 10 && al.data.items.every((i) => typeof i.count === "number"), "Admin: the 10 alert kinds are returned", al.error?.message);
  ok(!(await A.rpc("audit_actors")).error, "Admin: the person list works");
  const before = (await svc.from("audit_logs").select("id", { count: "exact", head: true }).eq("action", "report.export").contains("details", { report: "audit-log" })).count ?? 0;
  const ex = await A.rpc("audit_export", { p_format: "csv", p_group: "fees" });
  const after = (await svc.from("audit_logs").select("id", { count: "exact", head: true }).eq("action", "report.export").contains("details", { report: "audit-log" })).count ?? 0;
  ok(!ex.error && after === before + 1, "Admin: an export writes exactly one 'exported' entry", ex.error?.message);

  // everyone else
  for (const [who, c] of [["teacher1", T1], ["desk (office, no fee access)", DESK], ["fees (office with fee access)", FEE], ["not signed in", ANON]]) {
    const refused = [];
    for (const [fn, args] of calls) {
      const r = await c.rpc(fn, args);
      if (!r.error) refused.push(fn);
    }
    ok(refused.length === 0, `${who}: every audit function is refused`, refused.join(", "));
    const direct = await c.from("audit_logs").select("id").limit(5);
    ok(!!direct.error || (direct.data ?? []).length === 0, `${who}: reads no audit rows directly`);
  }

  // nobody can change or remove an entry
  const { data: one } = await svc.from("audit_logs").select("id, action").order("id", { ascending: false }).limit(1).single();
  for (const [who, c] of [["Admin", A], ["service key", svc], ["teacher1", T1]]) {
    const up = await c.from("audit_logs").update({ action: "tampered" }).eq("id", one.id).select();
    const del = await c.from("audit_logs").delete().eq("id", one.id).select();
    const ins = await c.from("audit_logs").insert({ action: "forged" }).select();
    ok((!!up.error || (up.data ?? []).length === 0) && (!!del.error || (del.data ?? []).length === 0) && (!!ins.error || (ins.data ?? []).length === 0), `${who}: update, delete and insert on the audit table all refused`);
  }
  const { data: still } = await svc.from("audit_logs").select("id, action").eq("id", one.id).single();
  ok(still?.action === one.action, "the entry is unchanged after all those attempts");

  // failed sign-in report: only the app server (service key) may write it; nobody signed out or signed in can call it directly
  const f = await ANON.rpc("log_failed_login", { p_email: "api-test-nobody@demo.kchs.test", p_ip: "10.7.7.7" });
  ok(!!f.error, "not signed in: cannot call the failed sign-in log directly");
  const fa = await A.rpc("log_failed_login", { p_email: "api-test-nobody@demo.kchs.test", p_ip: "10.7.7.7" });
  ok(!!fa.error, "Admin: cannot call the failed sign-in log directly either");
  const fs = await svc.rpc("log_failed_login", { p_email: "api-test-nobody@demo.kchs.test", p_ip: "10.7.7.7", p_user_agent: "api-test" });
  ok(!fs.error, "the app server (service key) may report a failed sign-in", fs.error?.message);
  const w = await ANON.rpc("log_event", { p_action: "x" });
  ok(!!w.error, "not signed in: cannot write any other log entry");
}
