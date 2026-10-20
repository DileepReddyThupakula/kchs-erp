// The emergency Admin password reset script (npm run reset-admin-password), run on the development project with the test shortcuts.
// A throwaway Admin and a throwaway teacher are created and removed.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseLoginId } from "../../src/lib/auth/login-id.mjs";

export const name = "emergency Admin password reset script";
const claims = (t) => JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service } = process.env;
  if (!url || !anon || !service) return skip("keys missing");
  const svc = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = Date.now().toString(36);
  const made = [];
  const mk = async (username, role) => {
    const id = parseLoginId(username);
    const u = await svc.auth.admin.createUser({ email: id.authEmail, password: "Old-Password-12345", email_confirm: true });
    const st = await svc.from("staff").insert({ user_id: u.data.user.id, app_role: role, employee_code: "RST-" + role.slice(0, 3).toUpperCase() + stamp.slice(-4), full_name: "Reset Test " + role, status: "active" }).select("id").single();
    await svc.from("staff_logins").insert({ staff_id: st.data.id, login_id: id.canonical, kind: id.kind });
    made.push([u.data.user.id, st.data.id]);
    return id;
  };
  const script = (login, password) => spawnSync(process.execPath, ["--env-file=.env.local", "scripts/reset-admin-password.mjs"], {
    encoding: "utf8", env: { ...process.env, KCHS_TEST_LOGIN: login, KCHS_TEST_NEW_PASSWORD: password }, cwd: process.cwd(), timeout: 60000 });
  try {
    const adminId = await mk("rst.admin." + stamp, "admin");
    const teacherId = await mk("rst.teacher." + stamp, "teacher");
    const short = script(adminId.canonical, "short");
    ok(short.status === 1 && /10 to 72/.test(short.stderr), "a password under 10 characters is refused");
    const t = script(teacherId.canonical, "A-Good-Password-77");
    ok(t.status === 1 && /No active Admin/.test(t.stderr), "a teacher's login ID is refused: only an Admin can be reset this way");
    const nobody = script("nobody." + stamp, "A-Good-Password-77");
    ok(nobody.status === 1 && /No active Admin/.test(nobody.stderr), "an unknown login ID is refused with the same message");
    const r = script(adminId.canonical, "A-Good-Password-77");
    ok(r.status === 0 && /Done/.test(r.stdout), "the reset works", r.stderr.slice(0, 200));
    ok(!r.stdout.includes("A-Good-Password-77") && !r.stderr.includes("A-Good-Password-77"), "the password is never printed");
    const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const old = await c.auth.signInWithPassword({ email: adminId.authEmail, password: "Old-Password-12345" });
    ok(!!old.error, "the old password no longer works");
    const si = await c.auth.signInWithPassword({ email: adminId.authEmail, password: "A-Good-Password-77" });
    ok(!si.error && claims(si.data.session.access_token).app_metadata?.must_change_password === true, "the new password works and must be changed at once");
    const { data: logs } = await svc.from("audit_logs").select("details, action").eq("action", "staff.password_reset_script").order("occurred_at", { ascending: false }).limit(1);
    ok(logs?.[0] && !JSON.stringify(logs[0]).includes("A-Good-Password-77") && /\*{6}|rst\.admin/.test(JSON.stringify(logs[0])), "an audit entry was written, without the password");
    // in an empty folder, so the real production file is never read by this test
    const empty = mkdtempSync(join(tmpdir(), "kchs-rst-"));
    const prod = spawnSync(process.execPath, [join(process.cwd(), "scripts/reset-admin-password.mjs"), "--production"], { encoding: "utf8", env: { PATH: process.env.PATH }, cwd: empty, timeout: 20000 });
    rmSync(empty, { recursive: true, force: true });
    ok(prod.status === 1 && /Production safety guard/.test(prod.stderr), "--production without the production file is refused");
  } finally {
    for (const [uid, sid] of made) { await svc.from("staff").delete().eq("id", sid); await svc.auth.admin.deleteUser(uid); }
  }
}
