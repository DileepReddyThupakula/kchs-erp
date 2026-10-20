// Certificates through the real API: who is refused, and two people issuing at the same moment never get the same number.
// The concurrency part uses real parallel connections and removes its certificates afterwards (the log entries stay: the log is append-only).
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

export const name = "certificates via the API (refusals, the TC draft lock, simultaneous numbering)";

async function signIn(url, anon, email, password) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  return error ? null : c;
}

async function asUser(connectionString, userId, sql, params) {
  const c = new pg.Client({ connectionString });
  await c.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
    await c.query("select set_config('role', 'authenticated', true)");
    const r = await c.query(sql, params);
    await c.query("commit");
    return { ok: true, rows: r.rows };
  } catch (e) {
    await c.query("rollback").catch(() => {});
    return { ok: false, error: e.message };
  } finally {
    await c.end();
  }
}

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, DEMO_USER_PASSWORD: pw, DATABASE_URL: dbUrl } = process.env;
  if (!url || !anon || !service || !pw || !dbUrl) return skip("keys missing");
  const [A, T1, DESK, FEE] = await Promise.all(["admin", "teacher1", "desk", "fees"].map((u) => signIn(url, anon, `${u}@demo.kchs.test`, pw)));
  if (![A, T1, DESK, FEE].every(Boolean)) return skip("a demo login is missing");
  const svc = createClient(url, service, { auth: { persistSession: false } });
  const ANON = createClient(url, anon, { auth: { persistSession: false } });
  const { data: yr } = await svc.from("academic_years").select("id, name").eq("is_current", true).single();
  const { data: studs } = await svc.from("students").select("id").eq("status", "active").limit(8);
  if (!yr || !studs || studs.length < 8) return skip("needs the demo students");
  const one = studs[0].id;

  // Admin: a preview works and changes nothing; the TC is a draft, so a real TC is refused
  const pv = await A.rpc("certificate_preview", { p_kind: "tc", p_student: one, p_language: "en", p_data: { leaving_date: "2026-01-05", leaving_reason: "moved" } });
  ok(!pv.error && pv.data?.flags?.draft_layout === true && pv.data?.certificate === null, "Admin: a TC preview works, carries the DRAFT flag and has no number", pv.error?.message);
  const real = await A.rpc("certificate_issue", { p_kind: "tc", p_student: one, p_language: "en", p_data: { leaving_date: "2026-01-05", leaving_reason: "moved" } });
  ok(!!real.error && /draft/i.test(real.error.message), "Admin: a real TC is refused while the layout is a draft");
  const st = (await svc.from("students").select("status").eq("id", one).single()).data;
  ok(st.status === "active", "the refused TC changed nothing");

  // everyone else is refused
  const calls = [
    ["certificate_preview", { p_kind: "bonafide", p_student: one, p_language: "en", p_data: { purpose: "bank" } }],
    ["certificate_issue", { p_kind: "bonafide", p_student: one, p_language: "en", p_data: { purpose: "bank" } }],
    ["certificate_issue", { p_kind: "tc", p_student: one, p_language: "en", p_data: { leaving_date: "2026-01-05", leaving_reason: "moved" } }],
    ["certificate_register", { p_kind: "bonafide", p_year: yr.id }],
    ["certificate_register_export", { p_kind: "tc", p_year: yr.id, p_format: "csv" }],
    ["certificate_checklist", { p_student: one }],
    ["certificate_set_start", { p_kind: "tc", p_year: yr.id, p_start: 10 }],
    ["certificate_template_set_draft", { p_kind: "tc", p_layout_draft: false }],
    ["certificate_signature_image", { p_on: true }],
    ["certificates_for_student", { p_student: one }],
  ];
  for (const [who, c] of [["teacher1", T1], ["desk (office, no certificate duty)", DESK], ["fees (office, fee access only)", FEE], ["not signed in", ANON]]) {
    const bad = [];
    for (const [fn, args] of calls) if (!(await c.rpc(fn, args)).error) bad.push(fn);
    ok(bad.length === 0, `${who}: every certificate function is refused`, bad.join(", "));
    for (const t of ["certificates", "certificate_prints", "certificate_templates", "certificate_series", "certificate_settings"]) {
      const r = await c.from(t).select("*").limit(1);
      ok(!!r.error || (r.data ?? []).length === 0, `${who}: reads nothing from ${t}`);
    }
  }
  ok(((await T1.from("certificates").insert({ kind: "bonafide" }).select()).error) !== null, "teacher1: cannot write the certificates table directly");
  ok(((await A.from("certificates").update({ number: "X" }).eq("kind", "bonafide").select()).data ?? []).length === 0, "Admin: cannot rewrite a certificate number directly either");

  // simultaneous issuing: 8 people at once, 8 different gap-free numbers
  const { data: adm } = await svc.from("staff").select("user_id").eq("employee_code", "DEMO-ADM").single();
  const db = new pg.Client({ connectionString: dbUrl });
  await db.connect();
  // what this test must leave exactly as it found it
  const footprint = async () => JSON.stringify((await db.query(`select (select count(*) from public.students where status <> 'active') not_active, (select count(*) from public.certificates) certs, (select count(*) from public.certificate_prints) prints, (select count(*) from public.certificate_series) series, (select count(*) from public.staff_permissions where duty = 'certificates_idcards') duty, (select md5(string_agg(kind || layout_draft::text || wording_confirmed::text, ',' order by kind)) from public.certificate_templates) templates, (select md5(row(prefix_tc, prefix_bonafide, prefix_study, show_signature_image)::text) from public.certificate_settings) settings`)).rows[0]);
  const before0 = await footprint();
  const before = (await db.query("select start_no, next_no from public.certificate_series where kind = 'bonafide' and academic_year_id = $1", [yr.id])).rows[0] ?? null;
  const made = [];
  try {
    const results = await Promise.all(studs.map((s) => asUser(dbUrl, adm.user_id, "select public.certificate_issue('bonafide', $1, 'en', $2::jsonb) as j", [s.id, JSON.stringify({ purpose: "concurrency test" })])));
    const good = results.filter((r) => r.ok);
    ok(good.length === 8, `simultaneous issue: all 8 succeed (${good.length} did)`, results.find((r) => !r.ok)?.error);
    const seqs = good.map((r) => Number(r.rows[0].j.number.split("/").pop())).sort((a, b) => a - b);
    for (const r of good) made.push(r.rows[0].j.id);
    ok(new Set(seqs).size === seqs.length, "simultaneous issue: no number is given twice", seqs.join(","));
    ok(seqs.every((n, i) => i === 0 || n === seqs[i - 1] + 1), "simultaneous issue: the numbers are consecutive (no gap)", seqs.join(","));
    const after = (await db.query("select next_no from public.certificate_series where kind = 'bonafide' and academic_year_id = $1", [yr.id])).rows[0];
    ok(after.next_no === seqs[seqs.length - 1] + 1, "simultaneous issue: the next number follows the last one given");
  } finally {
    if (made.length) {
      await db.query("delete from public.certificate_prints where certificate_id = any($1)", [made]);
      await db.query("delete from public.certificates where id = any($1)", [made]);
    }
    if (before) await db.query("update public.certificate_series set next_no = $2, start_no = $3 where kind = 'bonafide' and academic_year_id = $1", [yr.id, before.next_no, before.start_no]);
    else await db.query("delete from public.certificate_series where kind = 'bonafide' and academic_year_id = $1", [yr.id]);
    ok(await footprint() === before0, "clean-up: no student status, certificate, duty, template or setting was left changed by this test");
    await db.end();
  }
}
