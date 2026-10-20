// A new or reset login carries "must change password" in its token until the person chooses their own password.
// A throwaway login (no staff record) is created, used, and deleted.
import { createClient } from "@supabase/supabase-js";

export const name = "first sign-in: must change the password";
const claims = (t) => JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service } = process.env;
  if (!url || !anon || !service) return skip("keys missing");
  const svc = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const email = `force-${Date.now()}@sec.test`;
  const first = "First-Password-1", mine = "My-Own-Password-2";
  const { data: made, error: mErr } = await svc.auth.admin.createUser({ email, password: first, email_confirm: true, app_metadata: { must_change_password: true } });
  if (mErr || !made.user) return skip("could not create a throwaway login");
  const id = made.user.id;
  try {
    const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const si = await c.auth.signInWithPassword({ email, password: first });
    ok(!si.error && claims(si.data.session.access_token).app_metadata?.must_change_password === true, "a new login's token carries the must-change mark");
    // the person cannot clear the mark themselves (app metadata is server-only)
    const self = await c.auth.updateUser({ data: { must_change_password: false } });
    const t1 = (await c.auth.refreshSession()).data.session?.access_token;
    ok(!self.error && claims(t1).app_metadata?.must_change_password === true, "the person cannot clear the mark by editing their own profile");
    // the same password is refused; a new one works
    const same = await c.auth.updateUser({ password: first });
    ok(!!same.error, "choosing the password they were given is refused");
    const ch = await c.auth.updateUser({ password: mine });
    ok(!ch.error, "choosing a new password works", ch.error?.message);
    // the server clears the mark; after a refresh the token no longer carries it
    const clr = await svc.auth.admin.updateUserById(id, { app_metadata: { must_change_password: false } });
    ok(!clr.error, "the server clears the mark", clr.error?.message);
    const t2 = (await c.auth.refreshSession()).data.session?.access_token;
    ok(!!t2 && claims(t2).app_metadata?.must_change_password === false, "after a refresh the token no longer carries the mark");
    const again = await createClient(url, anon, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password: mine });
    ok(!again.error, "the new password signs in, and the old one no longer does");
    const old = await createClient(url, anon, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password: first });
    ok(!!old.error, "the given password is refused after the change");
    // an Admin reset sets the mark again
    await svc.auth.admin.updateUserById(id, { password: "Reset-Password-3x", app_metadata: { must_change_password: true } });
    const r = await createClient(url, anon, { auth: { persistSession: false } }).auth.signInWithPassword({ email, password: "Reset-Password-3x" });
    ok(!r.error && claims(r.data.session.access_token).app_metadata?.must_change_password === true, "after an Admin reset the mark is back");
  } finally {
    await svc.auth.admin.deleteUser(id);
  }
}
