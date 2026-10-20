// npm run create-first-admin                    (development)
// npm run create-first-admin -- --production    (PRODUCTION: reads .env.kchs-production)
// Creates the FIRST Admin of a new project: the staff record, the login and the login ID. Mac only. It refuses if an Admin already exists
// (then use `npm run reset-admin-password`). Safeguards: explicit --production flag, the project name typed by hand, the password typed twice
// (hidden, never shown or logged), at least 10 characters, the person must choose their own password at the first sign-in, and the new
// records are written to the audit log by the database (staff and login ID inserts).
import { createClient } from "@supabase/supabase-js";
import { PROJECT_NAMES, targetRefs, useTarget } from "./lib/prod-guard.mjs";
import { ask, askHidden } from "./lib/prompt.mjs";
import { loginLabel, parseLoginId } from "../src/lib/auth/login-id.mjs";

const mode = await useTarget("create-first-admin", { confirm: false });
const [ref] = targetRefs().refs;
const projectName = PROJECT_NAMES[ref];
const stop = (m) => { console.error(`\nSTOP: ${m}\n`); process.exit(1); };
if (!projectName) stop("I do not know the name of this project, so I will not continue.");
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
if (!url || !key) stop("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed in the environment file.");

// answers for the automatic test: only ever honoured on the development project
const t = mode === "dev" && process.env.KCHS_TEST_ANSWERS ? JSON.parse(process.env.KCHS_TEST_ANSWERS) : null;
console.log(`\nCreate the first Admin on ${mode === "production" ? "PRODUCTION" : "the development project"}: ${projectName}`);
const typed = t ? projectName : await ask(`Type the project name (${projectName}) to continue: `);
if (typed !== projectName) stop("The name does not match. Nothing was changed.");

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { count } = await sb.from("staff").select("id", { count: "exact", head: true }).eq("app_role", "admin");
if ((count ?? 0) > 0 && !(t && t.ignoreExistingAdmin)) stop("An Admin already exists in this project. This script only creates the FIRST Admin. If the Admin is locked out, use:  npm run reset-admin-password");

const fullName = (t ? t.name : await ask("Full name of the Admin: ")).trim();
if (fullName.length < 3 || fullName.length > 80) stop("Enter the full name (3 to 80 characters).");
console.log("\nLogin ID: a 10-digit mobile number, a username, or an email. A REAL EMAIL is recommended for the Admin: it helps you prove who you are and recover access.");
const id = parseLoginId(t ? t.login : await ask("Login ID: "));
if (!id.ok) stop(id.error);
let contact = null;
if (id.kind === "email") contact = id.canonical;
else {
  const e = (t ? t.email ?? "" : await ask("Real contact email (recommended, Enter to skip): ")).trim();
  if (e) { const c = parseLoginId(e); if (!c.ok || c.kind !== "email") stop("That is not a valid email address."); contact = c.canonical; }
  else {
    console.log("\nWARNING: no real email. If you lose this login ID or password, only the emergency script on your Mac can get you back in.");
    if ((t ? t.confirmNoEmail ?? "no email" : await ask("Type  no email  to continue without one: ")) !== "no email") stop("Cancelled. Nothing was changed.");
  }
}
const { data: used } = await sb.from("staff_logins").select("id").eq("login_id", id.canonical).maybeSingle();
if (used) stop("That login ID is already used. Nothing was changed.");

const p1 = t ? t.password : await askHidden("Password (at least 10 characters, typing is hidden): ");
if (p1.length < 10 || p1.length > 72) stop("The password must be 10 to 72 characters. Nothing was changed.");
const p2 = t ? t.password : await askHidden("Type it again: ");
if (p1 !== p2) stop("The two passwords are not the same. Nothing was changed.");

let code = "ADM-001";
for (let n = 1; n < 20; n++) { code = `ADM-${String(n).padStart(3, "0")}`; const { data } = await sb.from("staff").select("id").eq("employee_code", code).maybeSingle(); if (!data) break; }

const u = await sb.auth.admin.createUser({ email: id.authEmail, password: p1, email_confirm: true, app_metadata: { must_change_password: true } });
if (u.error || !u.data.user) stop("The login could not be created (" + (u.error?.status ?? "?") + "). Nothing was changed.");
const undo = async () => { await sb.from("staff").delete().eq("user_id", u.data.user.id); await sb.auth.admin.deleteUser(u.data.user.id); };
const st = await sb.from("staff").insert({ user_id: u.data.user.id, app_role: "admin", employee_code: code, full_name: fullName, designation: "Administrator", status: "active", email: contact }).select("id").single();
if (st.error) { await undo(); stop("The staff record could not be created (" + st.error.code + "). Nothing was kept."); }
const li = await sb.from("staff_logins").insert({ staff_id: st.data.id, login_id: id.canonical, kind: id.kind });
if (li.error) { await undo(); stop("The login ID could not be saved (" + li.error.code + "). Nothing was kept."); }
console.log(`\nDone. ${fullName} is the Admin (staff code ${code}, login ID ${loginLabel(id)}).\nThey must choose their own password at the first sign-in. Sign in on the deployed app, not on this Mac.\n`);
