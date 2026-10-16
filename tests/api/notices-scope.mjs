// Notices and diary scope through the real Supabase API (demo logins).
// Skips until the migration is applied and demo notices/diary are seeded.
import { createClient } from "@supabase/supabase-js";

export const name = "notices & diary: who sees what (demo logins via the API)";

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, DEMO_USER_PASSWORD: pw } = process.env;
  if (!url || !anon || !service || !pw) return skip("Supabase keys or DEMO_USER_PASSWORD missing in .env.local");
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const probe = await admin.from("notices").select("id", { head: true, count: "exact" });
  if (probe.error || !probe.count) return skip("notices migration not applied / demo notices not seeded");

  const login = async (email) => {
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email, password: pw });
    if (error) throw new Error(`sign-in ${email}: ${error.message}`);
    return c;
  };
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

  const { data: t1 } = await admin.from("staff").select("id").eq("employee_code", "DEMO-T01").single();
  const { data: allDiary } = await admin.from("diary_entries").select("id, status, archived_at");
  const { data: links } = await admin.from("diary_entry_sections").select("entry_id, section_id");
  const { data: ct } = await admin.from("sections").select("id").eq("class_teacher_id", t1.id);
  const { data: ta } = await admin.from("teacher_assignments").select("section_id").eq("staff_id", t1.id);
  const mine = new Set([...(ct ?? []).map((s) => s.id), ...(ta ?? []).map((a) => a.section_id)]);
  const expected = new Set(
    allDiary.filter((e) => e.status === "published" && !e.archived_at && links.some((l) => l.entry_id === e.id && mine.has(l.section_id))).map((e) => e.id),
  );

  const teacher = await login("teacher1@demo.kchs.test");
  const { data: seen } = await teacher.from("diary_entries").select("id, status").limit(5000);
  ok(seen.length === expected.size && seen.every((e) => expected.has(e.id) && e.status === "published"), `API: teacher1 sees exactly the ${expected.size} published diary entries of their sections`, `got ${seen.length}`);
  ok(seen.length < allDiary.length, "API: teacher1 does not see every diary entry");
  const { error: wErr } = await teacher.rpc("save_diary", { p: { entry_date: today, section_ids: [...mine], body: "Should not be allowed", status: "published" } });
  ok(!!wErr, "API: teacher1 cannot add diary entries", wErr?.message);
  const { error: pErr } = await teacher.rpc("save_notice", { p: { title: "Not allowed", body: "xx", audience: "all" } });
  ok(!!pErr, "API: teacher1 cannot create notices");

  const { data: vis } = await teacher.from("notices").select("id, title, status, expires_on, publish_date");
  ok(vis.every((n) => n.status === "published" && n.publish_date <= today && (!n.expires_on || n.expires_on >= today)), "API: teacher1 sees only published, current notices");
  ok(!vis.some((n) => /draft/i.test(n.title)), "API: teacher1 never sees the draft notice");
  ok(!vis.some((n) => /expired|old/i.test(n.title)), "API: teacher1 does not see the expired notice");
  const { data: all } = await admin.from("notices").select("id");
  ok(vis.length < all.length, "API: teacher1 sees fewer notices than exist");
  const { error: rErr } = await teacher.rpc("notice_readers", { p_notice: all[0].id });
  ok(!!rErr, "API: teacher1 cannot list readers");

  const adm = await login("admin@demo.kchs.test");
  const { data: admNotices } = await adm.from("notices").select("id");
  ok(admNotices.length === all.length, `API: admin sees all ${all.length} notices`);
  const { data: rd, error: rdErr } = await adm.rpc("notice_readers", { p_notice: all[0].id });
  ok(!rdErr && Array.isArray(rd), "API: admin sees who has read a notice", rdErr?.message);
}
