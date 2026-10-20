// A deactivated / removed staff member gets NOTHING, even while their old sign-in token is still valid.
// A throwaway teacher (many duties) signs in once; that ONE access token is then reused (plain HTTP,
// no refresh) after each way of taking access away. Everything it created is deleted at the end.
import { createClient } from "@supabase/supabase-js";

export const name = "deactivated / removed staff with a still-valid token";

const TABLES = [
  "students", "guardians", "student_guardians", "student_enrollments", "student_profiles", "student_secure_values", "student_documents",
  "fee_receipts", "fee_receipt_items", "student_fee_dues", "fee_heads", "fee_plans", "fee_structure", "fee_settings", "fee_concessions",
  "diary_entries", "diary_entry_sections", "notices", "notice_audience", "notice_reads", "notice_sends", "message_log",
  "attendance_sessions", "student_attendance", "staff_attendance", "leave_requests", "leave_balances", "leave_types",
  "exam_components", "result_groups", "result_group_members", "subject_pass_marks", "marks", "subject_results", "student_results",
  "grade_entries", "grade_bands", "report_remarks", "remark_bank", "report_card_prints", "certificates", "certificate_prints", "certificate_templates", "id_cards", "id_card_prints",
  "timetable_entries", "timetable_substitutions", "bell_schedules", "bell_periods",
  "teacher_assignments", "sections", "classes", "subjects", "class_subjects", "academic_years", "holidays", "school_settings",
  "staff", "staff_permissions", "audit_logs", "translation_usage", "number_sequences",
];
const RPCS = [
  ["my_duties", {}],
  ["notice_read_counts", {}],
  ["reveal_student_secure_values", { p_student_id: "00000000-0000-4000-8000-000000000000" }],
  ["report_card_data", { p_student: "00000000-0000-4000-8000-000000000000", p_group: "00000000-0000-4000-8000-000000000000" }],
  ["subject_result_calc", { p_student: "00000000-0000-4000-8000-000000000000", p_group: "00000000-0000-4000-8000-000000000000", p_subject: "00000000-0000-4000-8000-000000000000" }],
  ["audit_entries", {}],
  ["audit_alerts", { p_days: 7 }],
  ["audit_actors", {}],
  ["rollover_preview", { p_from: "00000000-0000-4000-8000-000000000000", p_to: "00000000-0000-4000-8000-000000000001" }],
  ["rollover_runs_list", {}],
  ["id_card_issue", { p_students: ["00000000-0000-4000-8000-000000000000"] }],
  ["id_card_register", { p_year: "00000000-0000-4000-8000-000000000000" }],
  ["certificate_issue", { p_kind: "bonafide", p_student: "00000000-0000-4000-8000-000000000000", p_language: "en", p_data: { purpose: "bank" } }],
  ["certificate_register", { p_kind: "bonafide", p_year: "00000000-0000-4000-8000-000000000000" }],
  ["save_exam_component", { p: { name: "x" } }],
  ["lock_exam_component", { p_component: "00000000-0000-4000-8000-000000000000" }],
  ["save_marks", { p_component: "00000000-0000-4000-8000-000000000000", p_section: "00000000-0000-4000-8000-000000000000", p_subject: "00000000-0000-4000-8000-000000000000", p_rows: [] }],
];

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service } = process.env;
  if (!url || !anon || !service) return skip("Supabase keys missing in .env.local");
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const { count: demoStudents } = await admin.from("students").select("id", { count: "exact", head: true });
  if (!demoStudents) return skip("no demo data loaded");

  const pw = `Tmp-${Math.random().toString(36).slice(2)}-Aa1`;
  const made = []; // { userId, staffId }
  const stamp = Date.now();

  async function person(label, role) {
    const email = `deact-${label}-${stamp}@demo.kchs.test`;
    const { data: u, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
    if (error) throw new Error(error.message);
    const { data: st, error: e2 } = await admin.from("staff").insert({ employee_code: `TST-${label}-${stamp}`.slice(0, 30), full_name: `Test ${label}`, app_role: role, user_id: u.user.id, email, status: "active" }).select("id").single();
    if (e2) throw new Error(e2.message);
    if (role === "teacher") {
      const duties = ["student_records", "all_class_attendance", "all_class_marks", "notices_diary", "timetable_edit", "certificates_idcards", "government_ids_view"];
      const { error: e3 } = await admin.from("staff_permissions").insert(duties.map((duty) => ({ staff_id: st.id, duty })));
      if (e3) throw new Error(e3.message);
      // also a class teacher, so the class-teacher paths are covered
      const { data: sec } = await admin.from("sections").select("id").is("class_teacher_id", null).limit(1);
      if (sec?.[0]) await admin.from("sections").update({ class_teacher_id: st.id }).eq("id", sec[0].id);
    }
    made.push({ userId: u.user.id, staffId: st.id, email });
    const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: s, error: e4 } = await c.auth.signInWithPassword({ email, password: pw });
    if (e4) throw new Error(e4.message);
    return { userId: u.user.id, staffId: st.id, token: s.session.access_token, refresh: s.session.refresh_token, expiresIn: s.session.expires_in };
  }

  // one raw HTTP call with the OLD token: no client, no refresh
  const hdr = (t) => ({ apikey: anon, Authorization: `Bearer ${t}`, "Content-Type": "application/json" });
  async function readAll(token) {
    const out = {};
    for (const t of TABLES) {
      const r = await fetch(`${url}/rest/v1/${t}?select=*&limit=5`, { headers: hdr(token) });
      const body = await r.json().catch(() => null);
      out[t] = Array.isArray(body) ? body.length : r.ok ? 0 : -1; // -1 = refused
    }
    return out;
  }
  async function rpcAll(token) {
    const out = {};
    for (const [fn, args] of RPCS) {
      const r = await fetch(`${url}/rest/v1/rpc/${fn}`, { method: "POST", headers: hdr(token), body: JSON.stringify(args) });
      const body = await r.json().catch(() => null);
      out[fn] = { status: r.status, empty: r.ok && (body == null || (Array.isArray(body) && body.length === 0) || (typeof body === "object" && !Array.isArray(body) && Object.keys(body).length === 0)), body };
    }
    return out;
  }
  async function writes(token) {
    const bad = [];
    const tries = [
      ["students", "PATCH", "?id=not.is.null", { full_name: "HACKED" }],
      ["notices", "POST", "", { title: "x", body: "x" }],
      ["fee_receipts", "PATCH", "?id=not.is.null", { notes: "x" }],
      ["marks", "PATCH", "?id=not.is.null", { marks: 1 }],
      ["staff", "PATCH", "?id=not.is.null", { app_role: "admin" }],
      ["staff_permissions", "POST", "", { duty: "fee_collection" }],
    ];
    for (const [t, m, q, b] of tries) {
      const r = await fetch(`${url}/rest/v1/${t}${q}`, { method: m, headers: { ...hdr(token), Prefer: "return=representation" }, body: JSON.stringify(b) });
      const body = await r.json().catch(() => null);
      const changed = r.ok && Array.isArray(body) && body.length > 0;
      if (changed) bad.push(t);
    }
    return bad;
  }
  async function storageList(token) {
    let n = 0;
    for (const bucket of ["diary-files", "notice-files", "payment-qr"]) {
      const r = await fetch(`${url}/storage/v1/object/list/${bucket}`, { method: "POST", headers: hdr(token), body: JSON.stringify({ prefix: "", limit: 5 }) });
      const body = await r.json().catch(() => null);
      if (r.ok && Array.isArray(body)) n += body.length;
    }
    return n;
  }
  // what the app's own gate (getCurrentStaff) looks at: the person's staff row + duties, with this token
  async function gate(token, userId) {
    const r = await fetch(`${url}/rest/v1/staff?select=id,app_role,status&user_id=eq.${userId}`, { headers: hdr(token) });
    const rows = await r.json().catch(() => []);
    const row = Array.isArray(rows) ? rows[0] : null;
    return !!row && row.status === "active" && !!row.app_role; // false -> requireStaff() redirects to /login
  }

  const scenarios = [
    ["deactivated (status = inactive)", (p) => admin.from("staff").update({ status: "inactive" }).eq("id", p.staffId)],
    ["left the school (status = left)", (p) => admin.from("staff").update({ status: "left" }).eq("id", p.staffId)],
    ["access revoked (role removed)", (p) => admin.from("staff").update({ app_role: null }).eq("id", p.staffId)],
    ["staff record deleted", (p) => admin.from("staff").delete().eq("id", p.staffId)],
    ["login unlinked (staff.user_id cleared)", (p) => admin.from("staff").update({ user_id: null }).eq("id", p.staffId)],
    ["Auth login deleted", (p) => admin.auth.admin.deleteUser(p.userId)],
  ];

  try {
    for (const role of ["teacher", "admin"]) {
      for (const [label, take] of scenarios) {
        const p = await person(`${role[0]}${made.length}`, role);
        const tag = `${role} ${label}`;
        // while active: the token works and sees plenty (otherwise this test would prove nothing)
        const before = await readAll(p.token);
        const seen = Object.values(before).filter((n) => n > 0).length;
        const beforeRpc = await rpcAll(p.token);
        ok(seen >= (role === "admin" ? 25 : 20) && (await gate(p.token, p.userId)), `[${tag}] while active the token sees ${seen} tables`, JSON.stringify(before));
        ok((beforeRpc.my_duties.body ?? []).length > 0, `[${tag}] while active my_duties is not empty`);

        const res = await take(p);
        if (res?.error) throw new Error(`${label}: ${res.error.message}`);

        // the SAME token, seconds later
        const after = await readAll(p.token);
        const leaks = Object.entries(after).filter(([, n]) => n > 0).map(([t, n]) => `${t}:${n}`);
        ok(leaks.length === 0, `[${tag}] every table returns nothing with the old token`, leaks.join(", "));
        const afterRpc = await rpcAll(p.token);
        const rpcLeaks = Object.entries(afterRpc).filter(([fn, v]) => !(v.status >= 400 || v.empty)).map(([fn, v]) => `${fn}:${v.status}`);
        ok(rpcLeaks.length === 0, `[${tag}] every function is refused or empty`, rpcLeaks.join(", "));
        ok((afterRpc.my_duties.body ?? []).length === 0, `[${tag}] my_duties is empty (no duty survives)`);
        const bad = await writes(p.token);
        ok(bad.length === 0, `[${tag}] writes change nothing`, bad.join(", "));
        ok((await storageList(p.token)) === 0, `[${tag}] file storage lists nothing`);
        ok(!(await gate(p.token, p.userId)), `[${tag}] the app's sign-in gate (getCurrentStaff) says "no access" -> every page redirects to /login`);
      }
    }

    // banning the login (what the Staff screen now does on deactivate) stops NEW tokens being issued
    const b = await person("ban", "teacher");
    const refresh = (rt) => fetch(`${url}/auth/v1/token?grant_type=refresh_token`, { method: "POST", headers: { apikey: anon, "Content-Type": "application/json" }, body: JSON.stringify({ refresh_token: rt }) });
    await admin.auth.admin.updateUserById(b.userId, { ban_duration: "876000h" });
    const rr = await refresh(b.refresh);
    ok(rr.status >= 400, "a banned (deactivated) login cannot refresh its token: no new sign-in token is issued", String(rr.status));
    const pw2 = await createClient(url, anon, { auth: { persistSession: false } }).auth.signInWithPassword({ email: made.at(-1).email, password: pw });
    ok(!!pw2.error, "and cannot sign in again with the password");
    await admin.auth.admin.updateUserById(b.userId, { ban_duration: "none" });
    const pw3 = await createClient(url, anon, { auth: { persistSession: false } }).auth.signInWithPassword({ email: made.at(-1).email, password: pw });
    ok(!pw3.error, "lifting the ban (re-activating) lets them sign in again");

    // the token's own lifetime, as issued
    const t = await person("life", "teacher");
    const payload = JSON.parse(Buffer.from(t.token.split(".")[1], "base64url").toString());
    console.log(`# token lifetime issued: expires_in=${t.expiresIn}s, exp-iat=${payload.exp - payload.iat}s`);
    ok(payload.exp - payload.iat <= 3600, `the access token lasts at most ${payload.exp - payload.iat} seconds`);
  } finally {
    // clean up everything created
    await admin.from("sections").update({ class_teacher_id: null }).in("class_teacher_id", made.map((m) => m.staffId));
    for (const m of made) {
      await admin.from("staff_permissions").delete().eq("staff_id", m.staffId);
      await admin.from("staff").delete().eq("id", m.staffId);
      await admin.auth.admin.deleteUser(m.userId).catch(() => {});
    }
  }
}
