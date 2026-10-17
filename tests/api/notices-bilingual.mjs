// Notices Part B through the real Supabase API (demo logins): parents notices, Telugu fields, the send checklist,
// simultaneous "open WhatsApp" clicks, and that teachers have no send access. Everything it creates is removed.
import { createClient } from "@supabase/supabase-js";

export const name = "notices: parents audience, checklist and permissions (demo logins via the API)";

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, DEMO_USER_PASSWORD: pw } = process.env;
  if (!url || !anon || !service || !pw) return skip("Supabase keys or DEMO_USER_PASSWORD missing in .env.local");
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const probe = await admin.from("notice_sends").select("id", { head: true, count: "exact" });
  if (probe.error) return skip("notices Part B migration not applied yet");
  const login = async (email) => {
    const c = createClient(url, anon, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email, password: pw });
    if (error) throw new Error(`sign-in ${email}: ${error.message}`);
    return c;
  };
  const TITLE = "ZZ API parents notice";
  const t0 = new Date().toISOString();
  const clean = async () => {
    const { data } = await admin.from("notices").select("id").like("title", "ZZ API%");
    for (const n of data ?? []) await admin.from("notices").delete().eq("id", n.id);
    await admin.from("message_log").delete().eq("kind", "notice").gte("created_at", t0);
  };
  await clean();
  const ADM = await login("admin@demo.kchs.test");
  const OFF = await login("office@demo.kchs.test"); // has the notices & diary duty
  const T1 = await login("teacher1@demo.kchs.test");
  try {
    const { data: id, error } = await ADM.rpc("save_notice", { p: { title: TITLE, body: "Annual Day rehearsals from Monday 19 October.", audience: "parents_all" } });
    ok(!error && !!id, "Admin creates a notice for parents (whole school)", error?.message);
    const seenDraft = await T1.from("notices").select("id").eq("id", id);
    ok((seenDraft.data ?? []).length === 0, "a teacher cannot see the draft");
    const pub = await ADM.rpc("publish_notice", { p_id: id });
    ok(!pub.error && /\/\d{3}$/.test(pub.data ?? ""), "Admin publishes it and it gets a circular number", pub.error?.message ?? pub.data);
    const again = await ADM.rpc("publish_notice", { p_id: id });
    ok(!again.error && again.data === pub.data, "publishing again keeps the same number (no gap, no duplicate)");
    const { data: row } = await admin.from("notices").select("te_status, title_te").eq("id", id).single();
    ok(row.te_status === "pending" && !row.title_te, "English only: the Telugu is pending until the server translates it");

    const seen = await T1.from("notices").select("id, audience").eq("id", id);
    ok((seen.data ?? []).length === 1 && seen.data[0].audience === "parents_all", "teacher1 sees the published whole-school parents notice (read only)");
    const edit = await T1.rpc("save_notice", { p: { id, title: "Hacked title", body: "hacked body", audience: "all" } });
    ok(!!edit.error, "teacher1 cannot edit it", edit.error?.message);
    const direct = await T1.from("notices").update({ title: "Direct hack" }).eq("id", id).select();
    ok(!direct.error && (direct.data ?? []).length === 0, "a direct table update changes nothing");
    const noList = await T1.rpc("notice_send_list", { p_notice: id });
    ok(!!noList.error, "teacher1 cannot read the send checklist", noList.error?.message);
    const noOpen = await T1.rpc("notice_send_open", { p_notice: id, p_key: "staff", p_channel: "app" });
    ok(!!noOpen.error, "teacher1 cannot open a send", noOpen.error?.message);
    const noTr = await T1.rpc("apply_notice_translation", { p_notice: id, p_title_te: "x", p_body_te: "y", p_hash: "z" });
    ok(!!noTr.error, "a signed-in user cannot store a translation (server only)", noTr.error?.message);

    const list = await OFF.rpc("notice_send_list", { p_notice: id });
    ok(!list.error && list.data.length >= 2, `the duty teacher sees one checklist row per section (${list.data?.length})`, list.error?.message);
    const key = list.data[0].group_key;
    const [o1, o2] = await Promise.all([OFF.rpc("notice_send_open", { p_notice: id, p_key: key, p_channel: "app" }), ADM.rpc("notice_send_open", { p_notice: id, p_key: key, p_channel: "web" })]);
    ok(!o1.error && !o2.error, "two people click Open WhatsApp for the same group at once: both succeed", o1.error?.message ?? o2.error?.message);
    const { data: rows } = await admin.from("notice_sends").select("id, status").eq("notice_id", id).eq("group_key", key);
    ok(rows.length === 1 && rows[0].status === "opened", "...and there is one row, status opened (never delivered)");
    const mk = await OFF.rpc("notice_send_mark", { p_notice: id, p_key: key, p_sent: true });
    ok(!mk.error, "the duty marks the group as sent", mk.error?.message);
    const cnt = await OFF.rpc("notice_send_counts");
    const mine = (cnt.data ?? []).find((c) => c.notice_id === id);
    ok(mine && mine.sent === 1 && mine.total === list.data.length, `"Sent to 1 of ${list.data.length} groups"`, JSON.stringify(mine));
    const { data: logs } = await admin.from("message_log").select("status, kind, target, summary").gte("created_at", t0).eq("kind", "notice");
    ok(logs.length === 2 && logs.every((l) => l.status === "opened" && l.target === "group"), "both opens are logged as opened, to a group", String(logs.length));
    const bogus = await OFF.rpc("notice_send_open", { p_notice: id, p_key: "staff", p_channel: "app" });
    ok(!!bogus.error, "the staff group is refused for a parents notice", bogus.error?.message);
    const anon0 = createClient(url, anon, { auth: { persistSession: false } });
    const parent = await anon0.from("notices").select("id").eq("id", id);
    ok(!!parent.error || (parent.data ?? []).length === 0, "a parent (no login) cannot read the notice at all");
  } finally {
    await clean();
  }
}
