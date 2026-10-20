// Removes ONLY demo data: staff whose code starts with DEMO- and logins
// ending in @demo.kchs.test. Real school configuration is kept.
// Needs: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from "@supabase/supabase-js";
import { DEMO_CODE_PREFIX, DEMO_EMAIL_DOMAIN } from "./demo-data.mjs";
import { wipeDemoStudents } from "./demo-students.mjs";
import { assertDevOnly } from "./lib/prod-guard.mjs";
assertDevOnly("wipe-demo.mjs");

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key } = process.env;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local)");
  process.exit(2);
}
if (!process.argv.includes("--yes")) {
  console.error("This deletes all DEMO staff and demo logins. Re-run with: npm run seed:wipe -- --yes");
  process.exit(2);
}

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

// Demo students first (only rows marked is_demo); real students are never touched.
await wipeDemoStudents();

// Staff first (teacher assignments cascade; class teacher links are cleared).
const { data: removed, error } = await db.from("staff").delete().like("employee_code", `${DEMO_CODE_PREFIX}%`).select("id");
if (error) throw error;

const { data: list, error: listErr } = await db.auth.admin.listUsers({ perPage: 1000 });
if (listErr) throw listErr;
let users = 0;
for (const u of list.users.filter((u) => u.email?.endsWith(`@${DEMO_EMAIL_DOMAIN}`))) {
  const { error: delErr } = await db.auth.admin.deleteUser(u.id);
  if (delErr) throw delErr;
  users++;
}
console.log(`Removed ${removed.length} demo staff and ${users} demo logins. School configuration kept.`);
