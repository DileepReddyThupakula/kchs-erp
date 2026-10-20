// The first-Admin script (npm run create-first-admin) on the DEVELOPMENT project, with the test shortcuts. A throwaway Admin is created and removed.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { parseLoginId } from "../../src/lib/auth/login-id.mjs";

export const name = "first-Admin script";
const claims = (t) => JSON.parse(Buffer.from(t.split(".")[1], "base64url").toString());

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service } = process.env;
  if (!url || !anon || !service) return skip("keys missing");
  const svc = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const stamp = Date.now().toString(36);
  const login = "first.admin." + stamp;
  const script = (answers, extraEnv = {}) => spawnSync(process.execPath, ["--env-file=.env.local", "scripts/create-first-admin.mjs"], {
    encoding: "utf8", env: { ...process.env, KCHS_TEST_ANSWERS: JSON.stringify(answers), ...extraEnv }, cwd: process.cwd(), timeout: 60000 });
  const good = { name: "First Admin Test", login, email: "", password: "First-Admin-Pass-1", ignoreExistingAdmin: true };
  try {
    const refused = script({ ...good, ignoreExistingAdmin: false });
    ok(refused.status === 1 && /An Admin already exists/.test(refused.stderr), "refuses when an Admin already exists (and points to the reset script)");
    const noEmail = script({ ...good, confirmNoEmail: "nope" });
    ok(noEmail.status === 1 && /Cancelled/.test(noEmail.stdout + noEmail.stderr), "a username without a real email needs 'no email' typed to continue");
    ok(/REAL EMAIL is recommended/.test(noEmail.stdout), "it recommends a real email");
    const short = script({ ...good, password: "short" });
    ok(short.status === 1 && /10 to 72/.test(short.stderr), "a password under 10 characters is refused");
    const badId = script({ ...good, login: "12345" });
    ok(badId.status === 1 && /mobile number/.test(badId.stderr), "an invalid login ID is refused");
    const made = script(good);
    ok(made.status === 0 && /Done\./.test(made.stdout), "creates the Admin", made.stderr.slice(0, 200));
    ok(!made.stdout.includes("First-Admin-Pass-1") && !made.stderr.includes("First-Admin-Pass-1"), "the password is never printed");
    const id = parseLoginId(login);
    const li = await svc.from("staff_logins").select("staff_id, kind").eq("login_id", id.canonical).maybeSingle();
    const staff = li.data ? (await svc.from("staff").select("app_role, status, designation, user_id, employee_code").eq("id", li.data.staff_id).single()).data : null;
    ok(staff?.app_role === "admin" && staff.status === "active" && staff.designation === "Administrator" && /^ADM-\d{3}$/.test(staff.employee_code), "an active Admin staff record and login ID exist");
    const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const si = await c.auth.signInWithPassword({ email: id.authEmail, password: "First-Admin-Pass-1" });
    ok(!si.error && claims(si.data.session.access_token).app_metadata?.must_change_password === true, "they can sign in, and must choose their own password at once");
    const again = script(good);
    ok(again.status === 1 && /already used/.test(again.stderr), "the same login ID cannot be created twice");
    const { data: logs } = await svc.from("audit_logs").select("action, table_name, new_data").eq("table_name", "staff").eq("action", "insert").order("occurred_at", { ascending: false }).limit(1);
    ok(logs?.[0]?.new_data?.employee_code === staff?.employee_code && !JSON.stringify(logs[0]).includes("First-Admin-Pass-1"), "the database wrote the audit entry for the new staff record, without the password");
    // production: refused without the production file (run in an empty folder, so the real file is never read)
    const empty = mkdtempSync(join(tmpdir(), "kchs-fa-"));
    const prod = spawnSync(process.execPath, [join(process.cwd(), "scripts/create-first-admin.mjs"), "--production"], { encoding: "utf8", env: { PATH: process.env.PATH }, cwd: empty, timeout: 20000 });
    rmSync(empty, { recursive: true, force: true });
    ok(prod.status === 1 && /Production safety guard/.test(prod.stderr), "--production without the production file is refused");
  } finally {
    const id = parseLoginId(login);
    const li = await svc.from("staff_logins").select("staff_id").eq("login_id", id.canonical).maybeSingle();
    if (li.data) {
      const s = await svc.from("staff").select("user_id").eq("id", li.data.staff_id).single();
      await svc.from("staff").delete().eq("id", li.data.staff_id);
      if (s.data?.user_id) await svc.auth.admin.deleteUser(s.data.user_id);
    }
  }
}
