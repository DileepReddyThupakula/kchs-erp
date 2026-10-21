// npm run demo:reset : puts the DEVELOPMENT project (the public demo's database) back to clean dummy data with NEUTRAL branding.
// Loads the demo data again where it is missing (staff, logins, students, fees, timetable, attendance, notices, exams: safe to re-run), makes the
// demo logins' password the one in DEMO_USER_PASSWORD, and sets the school's name, logo, phone and address to a neutral "Sample School".
// The demo exams are wiped and re-created; staff, students and fees are only topped up (fee receipts can never be deleted: gap-free numbers).
// Dev only: it refuses anywhere else.
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { assertDevOnly } from "./lib/prod-guard.mjs";
assertDevOnly("demo-reset.mjs");

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, DEMO_USER_PASSWORD: pw } = process.env;
if (!url || !key || !pw || pw.length < 8) { console.error("Needs NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DEMO_USER_PASSWORD (8+ characters) in .env.local."); process.exit(2); }

const step = (label, args) => {
  process.stdout.write(`${label}… `);
  const r = spawnSync(process.execPath, args, { env: process.env, encoding: "utf8" });
  if (r.status !== 0) { console.log("FAILED\n" + (r.stderr || r.stdout).split("\n").slice(-6).join("\n")); process.exit(1); }
  console.log("ok");
};
// neutral school identity: no real name, logo, phone, address, email, website, registration numbers or signature
const sb = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const neutral = {
  name: "Sample School", short_name: "Sample", logo_path: null, city: "Sample Town", district: "Sample District", state: "Sample State", pincode: null,
  phone: null, email: null, website: null, affiliation_no: null, udise_code: null, principal_name: null, principal_signature_path: null,
};
const { data: row } = await sb.from("school_settings").select("*").eq("id", 1).single();
const patch = Object.fromEntries(Object.entries(neutral).filter(([k]) => row && k in row));
const extra = { ...(row?.extra ?? {}), motto: null };
const { error } = await sb.from("school_settings").update({ ...patch, extra }).eq("id", 1);
if (error) { console.error("Could not set the neutral school identity:", error.message); process.exit(1); }
console.log("school identity set to Sample School (no logo, phone, address, email, website, registration numbers)");
// the fee payment details too: a fictional payee, no real UPI address, no QR picture
const { data: fee } = await sb.from("fee_settings").select("*").eq("id", 1).maybeSingle();
if (fee) {
  const fpatch = Object.fromEntries(Object.entries({ payee_name: "Sample School", upi_id: "sample@sampleupi", qr_path: null }).filter(([k]) => k in fee));
  const { error: fe } = await sb.from("fee_settings").update(fpatch).eq("id", 1);
  if (fe) { console.error("Could not set neutral fee payment details:", fe.message); process.exit(1); }
  console.log("fee payment details set to a fictional payee");
}
step("wipe demo notices (their circular numbers carry the school short name)", ["scripts/demo-notices.mjs", "wipe", "--yes"]);
step("wipe demo exams", ["scripts/demo-exams.mjs", "wipe", "--yes"]);
step("load staff, students, fees, timetable, attendance, notices", ["scripts/seed-demo.mjs"]);
step("load exams", ["scripts/demo-exams.mjs", "seed"]);

// every demo login gets the password in DEMO_USER_PASSWORD (the seed only sets it for logins it creates)
const sbAdmin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const { data: all } = await sbAdmin.auth.admin.listUsers({ perPage: 1000 });
let set = 0;
for (const u of all?.users ?? []) {
  if (!u.email?.toLowerCase().endsWith("@demo.kchs.test")) continue;
  const { error: e } = await sbAdmin.auth.admin.updateUserById(u.id, { password: pw, app_metadata: { ...u.app_metadata, must_change_password: false } });
  if (e) { console.error("Could not set the password of a demo login:", e.message); process.exit(1); }
  set++;
}
console.log(`password set on ${set} demo logins`);

console.log("\nDone. The demo logins use the password in DEMO_USER_PASSWORD.");
