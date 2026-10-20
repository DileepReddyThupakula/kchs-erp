// npm run reset-admin-password                    (development)
// npm run reset-admin-password -- --production    (PRODUCTION: reads .env.kchs-production)
// The EMERGENCY way back in when the only Admin has forgotten the password. Runs on the owner's Mac only.
// Safeguards: explicit --production flag for production, the project name typed by hand, the password typed twice (hidden, never shown or
// logged), at least 10 characters, the person must choose their own password at the next sign-in, and an entry is written to the audit log.
import { createClient } from "@supabase/supabase-js";
import { PROJECT_NAMES, targetRefs, useTarget } from "./lib/prod-guard.mjs";
import { ask, askHidden } from "./lib/prompt.mjs";
import { loginLabel, parseLoginId } from "../src/lib/auth/login-id.mjs";

const mode = await useTarget("reset-admin-password", { confirm: false });
const [ref] = targetRefs().refs;
const projectName = PROJECT_NAMES[ref];
const stop = (m) => { console.error(`\nSTOP: ${m}\n`); process.exit(1); };
if (!projectName) stop("I do not know the name of this project, so I will not continue.");
const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
if (!url || !key) stop("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are needed in the environment file.");

const testing = mode === "dev" ? process.env.KCHS_TEST_NEW_PASSWORD : undefined;   // for the automatic test only, and only on the development project
console.log(`\nEmergency Admin password reset on ${mode === "production" ? "PRODUCTION" : "the development project"}: ${projectName}`);
const typed = testing ? projectName : await ask(`Type the project name (${projectName}) to continue: `);
if (typed !== projectName) stop("The name does not match. Nothing was changed.");

const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const id = parseLoginId(process.env.KCHS_TEST_LOGIN || (await ask("Login ID of the Admin (mobile number, username or email): ")));
if (!id.ok) stop(id.error);
const { data: row } = await sb.from("staff_logins").select("staff_id").eq("login_id", id.canonical).maybeSingle();
const { data: staff } = row ? await sb.from("staff").select("id, user_id, app_role, status").eq("id", row.staff_id).single() : { data: null };
if (!staff || staff.app_role !== "admin" || staff.status !== "active" || !staff.user_id) stop("No active Admin has that login ID. Nothing was changed.");

const p1 = testing ?? (await askHidden("New password (at least 10 characters, typing is hidden): "));
if (p1.length < 10 || p1.length > 72) stop("The password must be 10 to 72 characters. Nothing was changed.");
const p2 = testing ?? (await askHidden("Type it again: "));
if (p1 !== p2) stop("The two passwords are not the same. Nothing was changed.");

const { error } = await sb.auth.admin.updateUserById(staff.user_id, { password: p1, app_metadata: { must_change_password: true } });
if (error) stop("The password could not be changed (" + error.status + "). Nothing was changed.");
const log = await sb.rpc("log_script_event", { p_action: "staff.password_reset_script", p_details: { login: loginLabel(id), project: projectName } });
if (log.error) console.error("WARNING: the password was changed but the audit entry could not be written. Tell your developer.");
console.log(`\nDone. ${loginLabel(id)} can sign in with the new password and will be asked to choose their own at once.\n`);
