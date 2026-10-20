// ID cards through the real API: who is refused, nothing private on a card, and eight people issuing at the same moment never get the same number.
// The concurrency part uses real parallel connections and removes its cards afterwards (the log entries stay: the log is append-only).
import { createClient } from "@supabase/supabase-js";
import pg from "pg";

export const name = "ID cards via the API (refusals, what is on a card, simultaneous numbering)";

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
  const zero = "00000000-0000-4000-8000-000000000000";

  const db = new pg.Client({ connectionString: dbUrl });
  await db.connect();
  const footprint = async () => JSON.stringify((await db.query(`select (select count(*) from public.students where status <> 'active') not_active, (select count(*) from public.id_cards) cards, (select count(*) from public.id_card_prints) prints, (select count(*) from public.id_card_batches) batches, (select count(*) from public.id_card_series) series, (select count(*) from public.staff_permissions where duty = 'certificates_idcards') duty, (select md5(row(prefix, show_phone, show_blood_group)::text) from public.id_card_settings) settings, (select count(*) from public.students where photo_path is not null) photos`)).rows[0]);
  const before0 = await footprint();
  const made = [];
  try {
    // everyone else is refused
    const calls = [
      ["id_card_sections", {}], ["id_card_candidates", { p_class: zero }], ["id_card_issue", { p_students: [one] }], ["id_card_print_data", { p_cards: [zero] }], ["id_card_print", { p_cards: [zero] }],
      ["id_card_replace", { p_card: zero, p_reason: "lost" }], ["id_card_cancel", { p_card: zero, p_reason: "mistake" }], ["id_card_lookup", { p_number: "ID/X/0001" }],
      ["id_card_register", { p_year: yr.id }], ["id_card_register_export", { p_year: yr.id, p_format: "csv" }], ["id_cards_for_student", { p_student: one }],
      ["id_card_settings_get", {}], ["id_card_settings_save", { p_prefix: "ID", p_show_phone: false, p_show_blood_group: false }],
    ];
    for (const [who, c] of [["teacher1", T1], ["desk (office, student records and notices only)", DESK], ["fees (office, fee access only)", FEE], ["not signed in", ANON]]) {
      const bad = [];
      for (const [fn, args] of calls) if (!(await c.rpc(fn, args)).error) bad.push(fn);
      ok(bad.length === 0, `${who}: every ID card function is refused`, bad.join(", "));
      for (const t of ["id_cards", "id_card_prints", "id_card_batches", "id_card_series", "id_card_settings"]) {
        const r = await c.from(t).select("*").limit(1);
        ok(!!r.error || (r.data ?? []).length === 0, `${who}: reads nothing from ${t}`);
      }
    }
    ok(!!(await FEE.rpc("student_photo_set", { p_student: one, p_path: `${one}/x.jpg`, p_w: 600, p_h: 800, p_bytes: 1000, p_mime: "image/jpeg" })).error, "fees (office, fee access only): cannot add a photo");
    ok(!!(await ANON.rpc("student_photos_plan", { p_files: [] })).error, "not signed in: cannot preview a bulk photo upload");
    ok(((await T1.from("id_cards").insert({ number: "X" }).select()).error) !== null, "teacher1: cannot write the cards table directly");
    ok(((await A.from("id_cards").update({ number: "X" }).eq("status", "issued").select()).data ?? []).length === 0, "Admin: cannot rewrite a card number directly either");

    // the Admin: reads and the lookups work, and a lookup of nothing is logged and answers "not found"
    ok(!(await A.rpc("id_card_sections")).error && !(await A.rpc("id_card_settings_get")).error, "Admin: the sections and the settings load");
    const lk = await A.rpc("id_card_lookup", { p_number: "ID/NOTHING/0000" });
    ok(!lk.error && lk.data.found === false, "Admin: a lookup of an unknown number says not found");

    // simultaneous issuing: 8 people at once (the Admin's login, photo-pending override with a reason because demo students have no photos)
    const { data: adm } = await svc.from("staff").select("user_id").eq("employee_code", "DEMO-ADM").single();
    const results = await Promise.all(studs.map((s) => asUser(dbUrl, adm.user_id, "select public.id_card_issue($1::uuid[], $2::jsonb) as j", [[s.id], JSON.stringify({ [s.id]: "concurrency test" })])));
    const good = results.filter((r) => r.ok);
    ok(good.length === 8, `simultaneous issue: all 8 succeed (${good.length} did)`, results.find((r) => !r.ok)?.error);
    const issued = good.flatMap((r) => r.rows[0].j.issued);
    const skipped = good.flatMap((r) => r.rows[0].j.skipped);
    for (const c of issued) made.push(c.card_id);
    const seqs = issued.map((c) => Number(c.number.split("/").pop())).sort((a, b) => a - b);
    ok(issued.length === 8 && skipped.length === 0, "simultaneous issue: 8 cards issued, none skipped", JSON.stringify(skipped));
    ok(new Set(seqs).size === seqs.length, "simultaneous issue: no number is given twice", seqs.join(","));
    ok(seqs.every((n, i) => i === 0 || n === seqs[i - 1] + 1), "simultaneous issue: the numbers are consecutive (no gap)", seqs.join(","));
    // what is on a card, read through the API
    const bundle = await A.rpc("id_card_print_data", { p_cards: made.slice(0, 3) });
    ok(!bundle.error && bundle.data.cards.length === 3 && bundle.data.cards.every((c) => c.qr === c.number), "Admin: the QR of every card is exactly its card number", bundle.error?.message);
    const allowed = new Set(["card_id", "number", "qr", "status", "year", "name", "name_te", "class", "section", "admission_no", "phone", "blood_group", "photo_path", "photo_pending"]);
    ok(bundle.data.cards.every((c) => Object.keys(c).every((k) => allowed.has(k))), "Admin: a card carries only the allowed fields (no address, date of birth, ID, fee, marks or attendance)");
  } finally {
    if (made.length) {
      await db.query("delete from public.id_card_prints where card_id = any($1)", [made]);
      await db.query("delete from public.id_cards where id = any($1)", [made]);
    }
    await db.query("delete from public.id_card_batches where id not in (select batch_id from public.id_cards where batch_id is not null)");
    await db.query("delete from public.id_card_series where academic_year_id = $1 and not exists (select 1 from public.id_cards where academic_year_id = $1)", [yr.id]);
    ok(await footprint() === before0, "clean-up: no student status, photo, card, duty or setting was left changed by this test");
    await db.end();
  }
}
