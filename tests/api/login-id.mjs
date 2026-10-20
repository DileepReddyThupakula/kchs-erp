// Login IDs through the real API: a mobile number / username signs in through its hidden address; email logins still work;
// login IDs are readable only by the Admin and the person themself. Throwaway staff and logins are removed at the end.
import { createClient } from "@supabase/supabase-js";
import { parseLoginId } from "../../src/lib/auth/login-id.mjs";

export const name = "login IDs: mobile number, username, email";

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, DEMO_USER_PASSWORD: pw } = process.env;
  if (!url || !anon || !service || !pw) return skip("keys missing");
  const svc = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const as = async (email, password) => { const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } }); const { error } = await c.auth.signInWithPassword({ email, password }); return error ? { error } : { c }; };
  const mobile = "9" + String(Date.now()).slice(-9), username = "apitest." + Date.now().toString(36);
  const made = [];       // [userId, staffId]
  try {
    for (const raw of [mobile, username]) {
      const id = parseLoginId(raw);
      const u = await svc.auth.admin.createUser({ email: id.authEmail, password: "Throwaway-Pass-1", email_confirm: true });
      if (u.error) return skip("could not create a throwaway login: " + u.error.message);
      const st = await svc.from("staff").insert({ user_id: u.data.user.id, app_role: "teacher", employee_code: "API-" + raw.slice(-6).toUpperCase(), full_name: "Api Login Test " + raw.slice(-4), status: "active" }).select("id").single();
      await svc.from("staff_logins").insert({ staff_id: st.data.id, login_id: id.canonical, kind: id.kind });
      made.push([u.data.user.id, st.data.id, id]);
    }
    for (const [, , id] of made) {
      const s = await as(id.authEmail, "Throwaway-Pass-1");
      ok(!s.error, `${id.kind}: signs in through the hidden address`, s.error?.message);
      const mine = await s.c.from("staff_logins").select("login_id");
      ok((mine.data ?? []).length === 1 && mine.data[0].login_id === id.canonical, `${id.kind}: the person reads only their own login ID`);
      const others = await s.c.from("staff_logins").select("login_id").neq("staff_id", made.find((m) => m[2] === id)[1]);
      ok((others.data ?? []).length === 0, `${id.kind}: and no colleague's login ID`);
      const w = await s.c.from("staff_logins").update({ login_id: "9000000000" }).eq("staff_id", made.find((m) => m[2] === id)[1]).select();
      ok(!!w.error || (w.data ?? []).length === 0, `${id.kind}: cannot change their own login ID`);
    }
    const bad = await as(made[0][2].authEmail, "wrong-password");
    ok(!!bad.error && /invalid/i.test(bad.error.message), "a wrong password for a mobile login is refused like any other");
    const nobody = await as(parseLoginId("9000000001").authEmail, "whatever-pass-1");
    ok(!!nobody.error && nobody.error.message === bad.error.message, "a number that does not exist gets the very same answer (no way to find out who exists)");
    // email logins and the Admin's view
    const t1 = await as("teacher1@demo.kchs.test", pw);
    ok(!t1.error, "an existing email login still signs in");
    const own = await t1.c.from("staff_logins").select("login_id");
    ok((own.data ?? []).length === 1 && own.data[0].login_id === "teacher1@demo.kchs.test", "an existing email login got its login ID (its email) and sees only that");
    const admin = await as("admin@demo.kchs.test", pw);
    const all = await admin.c.from("staff_logins").select("login_id");
    ok((all.data ?? []).length >= 8 && all.data.some((r) => r.login_id === made[0][2].canonical), "the Admin reads every login ID");
    const anonRead = await createClient(url, anon, { auth: { persistSession: false } }).from("staff_logins").select("login_id");
    ok(!!anonRead.error || (anonRead.data ?? []).length === 0, "signed out: no login IDs");
    // the sign-in server's functions are not callable by a signed-in person
    const lock = await admin.c.rpc("login_is_locked", { p_key: "0".repeat(32) });
    ok(!!lock.error, "the lock check is not callable by the Admin from the browser");
  } finally {
    for (const [uid, sid] of made) { await svc.from("staff").delete().eq("id", sid); await svc.auth.admin.deleteUser(uid); }
  }
}
