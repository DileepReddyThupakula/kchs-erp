// Reports through the real API: who may ask, only their own scope, exports logged, no ID numbers. Needs the demo data and logins.
import { createClient } from "@supabase/supabase-js";

export const name = "reports via the API (teacher1, office staff with / without fee access, Admin)";

async function signIn(url, anon, email, password) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  return error ? null : c;
}

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, DEMO_USER_PASSWORD: pw } = process.env;
  if (!url || !anon || !service || !pw) return skip("keys missing");
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: yr } = await admin.from("academic_years").select("id, start_date").eq("is_current", true).single();
  const { data: t1 } = await admin.from("staff").select("id").eq("employee_code", "DEMO-T01").single();
  const { data: grp } = await admin.from("result_groups").select("id").eq("academic_year_id", yr.id).eq("kind", "term").not("locked_at", "is", null).limit(1);
  if (!yr || !t1 || !grp?.length) return skip("demo data missing (seed:demo, seed:demo-exams)");
  const Y = { p_year: yr.id };
  const [T, FEE, DESK, A] = await Promise.all(["teacher1", "fees", "desk", "admin"].map((u) => signIn(url, anon, `${u}@demo.kchs.test`, pw)));
  if (!T || !FEE || !DESK || !A) return skip("a demo login is missing");
  try {
    // --- teacher: own scope only
    const [{ data: mine }, { data: ct }] = await Promise.all([admin.from("teacher_assignments").select("section_id").eq("staff_id", t1.id), admin.from("sections").select("id").eq("class_teacher_id", t1.id)]);
    const my = new Set([...mine.map((m) => m.section_id), ...ct.map((c) => c.id)]);
    const st = await T.rpc("report_strength", Y);
    ok(!st.error && st.data.length > 0 && st.data.every((r) => my.has(r.section_id)), "teacher1: the strength report lists only their own sections", st.error?.message);
    const all = await A.rpc("report_strength", Y);
    ok(all.data.length > st.data.length, "Admin: the same report lists every section");
    const sr = await T.rpc("report_subject_results", { p_group: grp[0].id });
    ok(!sr.error && sr.data.every((r) => my.has(r.section_id)), "teacher1: subject results only for their own sections", sr.error?.message);
    for (const [fn, args] of [["report_demographics", Y], ["report_admissions", { ...Y, p_from: yr.start_date, p_to: "2099-01-01" }], ["report_staff_attendance", { p_from: yr.start_date, p_to: "2099-01-01" }], ["report_fee_dues_by_class", Y], ["report_fee_defaulters", Y], ["report_fee_collection_monthly", Y], ["report_fee_concessions", Y]]) {
      const r = await T.rpc(fn, args);
      ok(!!r.error, `teacher1: ${fn} is refused`, r.error?.message);
    }
    const cr = await T.rpc("report_class_results", { p_group: grp[0].id });
    ok(!cr.error ? cr.data.every((r) => my.has(r.section_id)) : true, "teacher1: class results (if allowed at all) only for sections they are class teacher of");
    // --- fee reports
    for (const fn of ["report_fee_dues_by_class", "report_fee_defaulters", "report_fee_collection_monthly", "report_fee_concessions"]) {
      const f = await FEE.rpc(fn, Y);
      ok(!f.error, `office staff with fee access: ${fn}`, f.error?.message);
      const d = await DESK.rpc(fn, Y);
      ok(!!d.error, `office staff without fee access: ${fn} is refused`, d.error?.message);
    }
    const dues = await FEE.rpc("report_fee_dues_by_class", Y);
    ok(dues.data.length > 0 && dues.data.some((r) => Number(r.billed_paise) > 0), "the dues report has real numbers");
    // --- no ID numbers or contact details in any report row
    const probes = [st.data, all.data, dues.data, (await FEE.rpc("report_fee_defaulters", Y)).data, (await A.rpc("report_demographics", Y)).data, (await A.rpc("report_admissions", { ...Y, p_from: yr.start_date, p_to: "2099-01-01" })).data];
    const keys = new Set(probes.flat().flatMap((r) => Object.keys(r ?? {})));
    ok(![...keys].some((k) => /aadhaar|udid|ration|child_id|phone|mobile|address|birth|dob/i.test(k)), "no report row has an ID, phone, address or birth-date field", [...keys].join());
    const text = JSON.stringify(probes).replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "ID"); // record ids are not Aadhaar numbers
    ok(!/\b\d{12}\b/.test(text), "and no 12-digit number (Aadhaar-shaped) appears in any report row");
    // --- logging
    const tag = `api-test-${Date.now()}`;
    const lg = await T.rpc("log_report", { p_report: "strength", p_format: "csv", p_filters: { tag }, p_rows: st.data.length });
    ok(!lg.error, "an export is logged through log_report", lg.error?.message);
    const { data: logged } = await admin.from("audit_logs").select("action, details, actor_role").eq("action", "report.export").contains("details", { filters: { tag } });
    ok(logged?.length === 1 && logged[0].details.report === "strength" && logged[0].details.format === "csv" && logged[0].actor_role === "teacher", "the log row names the report, the format, the filters and the role");
    const bad = await T.rpc("log_report", { p_report: "strength", p_format: "whatsapp" });
    ok(!!bad.error, "WhatsApp is not an allowed way to share a report");
    // --- dashboards in one call
    const sd = await T.rpc("staff_dashboard", { p_year: yr.id, p_today: new Date().toISOString().slice(0, 10) });
    ok(!sd.error && sd.data.fees === null, "teacher1's dashboard comes in one call and has no fee numbers", sd.error?.message);
    const fd = await FEE.rpc("staff_dashboard", { p_year: yr.id, p_today: new Date().toISOString().slice(0, 10) });
    ok(!fd.error && fd.data.fees && true, "the fee clerk's dashboard has the fee numbers");
    const dd = await DESK.rpc("staff_dashboard", { p_year: yr.id, p_today: new Date().toISOString().slice(0, 10) });
    ok(!dd.error && dd.data.fees === null, "the front-office person's dashboard has no fee numbers");
    const ad = await A.rpc("admin_dashboard", { p_year: yr.id, p_today: new Date().toISOString().slice(0, 10) });
    ok(!ad.error && ad.data.fees, "Admin's dashboard has them");
    const tad = await T.rpc("admin_dashboard", { p_year: yr.id, p_today: new Date().toISOString().slice(0, 10) });
    ok(!!tad.error, "a teacher cannot open the Admin dashboard data");
  } finally {
    for (const c of [T, FEE, DESK, A]) await c?.auth.signOut();
  }
}
