// Diary workflow through the real Supabase API (demo logins): two teachers submitting at the same
// moment, the same pair twice at once, privacy of drafts, no direct writes, publish and lock.
// Uses a date 5 days ahead for one demo section; everything it creates is removed afterwards.
import { createClient } from "@supabase/supabase-js";

export const name = "diary workflow: simultaneous submissions, privacy, publish and lock (demo logins via the API)";

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, DEMO_USER_PASSWORD: pw } = process.env;
  if (!url || !anon || !service || !pw) return skip("Supabase keys or DEMO_USER_PASSWORD missing in .env.local");
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const probe = await admin.from("diary_skips").select("id", { head: true, count: "exact" });
  if (probe.error) return skip("diary workflow migration not applied yet");
  const login = async (email) => {
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email, password: pw });
    if (error) throw new Error(`sign-in ${email}: ${error.message}`);
    return c;
  };
  const { data: t1 } = await admin.from("staff").select("id").eq("employee_code", "DEMO-T01").single();
  const { data: t2 } = await admin.from("staff").select("id").eq("employee_code", "DEMO-T02").single();
  const { data: a1 } = await admin.from("teacher_assignments").select("section_id, subject_id").eq("staff_id", t1.id);
  const { data: a2 } = await admin.from("teacher_assignments").select("section_id, subject_id").eq("staff_id", t2.id);
  const pair = a1?.flatMap((x) => (a2 ?? []).filter((y) => y.section_id === x.section_id && y.subject_id !== x.subject_id).map((y) => ({ section: x.section_id, s1: x.subject_id, s2: y.subject_id })))[0];
  if (!pair) return skip("no demo section where teacher1 and teacher2 teach different subjects");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
  const d = new Date(today + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 5);
  const date = d.toISOString().slice(0, 10);

  const clean = async () => {
    const { data: links } = await admin.from("diary_entry_sections").select("entry_id").eq("section_id", pair.section);
    const ids = (links ?? []).map((l) => l.entry_id);
    if (ids.length) await admin.from("diary_entries").delete().in("id", ids).eq("entry_date", date);
  };
  await clean();
  const T1 = await login("teacher1@demo.kchs.test");
  const T2 = await login("teacher2@demo.kchs.test");
  const ADM = await login("admin@demo.kchs.test");
  const sub = (c, subject, body, submit = true) => c.rpc("submit_diary", { p: { section_id: pair.section, entry_date: date, subject_id: subject, kind: "subject", body, submit } });
  try {
    // two different teachers, same class, same moment
    const [r1, r2] = await Promise.all([sub(T1, pair.s1, "Concurrent line from teacher one"), sub(T2, pair.s2, "Concurrent line from teacher two")]);
    ok(!r1.error && !r2.error, "two teachers submit for the same class at the same moment: both succeed", r1.error?.message ?? r2.error?.message);
    const { data: mine } = await admin.from("diary_entries").select("id, subject_id, status").eq("entry_date", date).in("id", (await admin.from("diary_entry_sections").select("entry_id").eq("section_id", pair.section)).data.map((l) => l.entry_id));
    ok(mine.length === 2 && mine.every((e) => e.status === "submitted"), "both lines exist, one per subject, status submitted", String(mine.length));

    // the same pair twice at once -> still one entry
    const [x1, x2] = await Promise.all([sub(T1, pair.s1, "Race A text here"), sub(T1, pair.s1, "Race B text here")]);
    ok(!x1.error && !x2.error, "the same teacher saving the same subject twice at once: both succeed", x1.error?.message ?? x2.error?.message);
    const { data: again } = await admin.from("diary_entries").select("id").eq("entry_date", date).eq("subject_id", pair.s1).in("id", (await admin.from("diary_entry_sections").select("entry_id").eq("section_id", pair.section)).data.map((l) => l.entry_id));
    ok(again.length === 1, "...and there is exactly one entry for that section, date and subject", String(again.length));

    // privacy + permissions
    const { data: seen2 } = await T2.from("diary_entries").select("id, subject_id").eq("entry_date", date);
    ok(seen2.every((e) => e.subject_id !== pair.s1), "teacher2 cannot see teacher1's submitted line");
    const bad = await sub(T2, pair.s1, "Not my subject");
    ok(!!bad.error, "teacher2 cannot submit teacher1's subject", bad.error?.message);
    const direct = await T1.from("diary_entries").insert({ academic_year_id: "00000000-0000-4000-8000-000000000000", entry_date: date, body: "direct write" });
    ok(!!direct.error, "direct table insert is refused", direct.error?.message);
    const noPub = await T1.rpc("publish_class_diary", { p_section: pair.section, p_date: date });
    ok(!!noPub.error, "a teacher cannot publish", noPub.error?.message);
    const noLog = await T1.rpc("log_message", { p_kind: "diary", p_target: "group", p_student: null, p_section: pair.section, p_date: date, p_channel: "app", p_summary: "x" });
    ok(!!noLog.error, "a teacher cannot log a WhatsApp share (they have no sharing)", noLog.error?.message);

    // publish as Admin, then teachers are locked out
    const pub = await ADM.rpc("publish_class_diary", { p_section: pair.section, p_date: date });
    ok(!pub.error && pub.data === 2, "Admin publishes the class (2 lines)", pub.error?.message ?? String(pub.data));
    const { data: seen2b } = await T2.from("diary_entries").select("id, subject_id").eq("entry_date", date);
    ok(seen2b.some((e) => e.subject_id === pair.s1), "after publication teacher2 can read teacher1's line (read-only)");
    const lock = await sub(T1, pair.s1, "Edit after publishing");
    ok(!!lock.error, "a teacher cannot edit after publication", lock.error?.message);
    const rep = await ADM.rpc("publish_class_diary", { p_section: pair.section, p_date: date });
    ok(!rep.error && rep.data === 0, "publishing again changes nothing", rep.error?.message ?? String(rep.data));
  } finally {
    await clean();
  }
}
