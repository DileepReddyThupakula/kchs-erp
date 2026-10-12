// Loads DEMO data: dummy staff + 4 demo logins (admin, office-duty teacher,
// teacher1, teacher2), their duties, class teachers and subject assignments.
// Safe to re-run. Remove with `npm run seed:wipe`.
// Needs: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEMO_USER_PASSWORD.
import { createClient } from "@supabase/supabase-js";
import { DEMO_CLASS_TEACHERS, DEMO_DUTIES, DEMO_STAFF, DEMO_SUBJECT_TEACHERS } from "./demo-data.mjs";
import { seedDemoStudents } from "./demo-students.mjs";
import { seedDemoFees } from "./demo-fees.mjs";

const { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, DEMO_USER_PASSWORD: password } = process.env;
for (const [k, v] of Object.entries({ NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SERVICE_ROLE_KEY: key, DEMO_USER_PASSWORD: password })) {
  if (!v) {
    console.error(`${k} is not set (add it to .env.local)`);
    process.exit(2);
  }
}
if (password.length < 8) {
  console.error("DEMO_USER_PASSWORD must be at least 8 characters");
  process.exit(2);
}

const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function ensureUser(email) {
  const { data: list, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existing = list.users.find((u) => u.email === email);
  if (existing) return existing.id;
  const { data, error: createErr } = await db.auth.admin.createUser({ email, password, email_confirm: true });
  if (createErr) throw createErr;
  return data.user.id;
}

let staffCount = 0;
const logins = [];
for (const s of DEMO_STAFF) {
  const row = { ...s.row };
  if (s.email) {
    row.user_id = await ensureUser(s.email);
    row.app_role = s.app_role;
    row.email = s.email;
    logins.push(`${s.email} (${s.app_role})`);
  }
  const { error } = await db.from("staff").upsert(row, { onConflict: "employee_code" });
  if (error) throw new Error(`${row.employee_code}: ${error.message}`);
  staffCount++;
}

console.log(`Demo staff upserted: ${staffCount} (19 teachers, 1 ayah, + demo admin & office-duty teacher)`);

// ---- duties
const { data: staffRows, error: staffErr } = await db.from("staff").select("id, employee_code").like("employee_code", "DEMO-%");
if (staffErr) throw staffErr;
const staffId = Object.fromEntries(staffRows.map((r) => [r.employee_code, r.id]));
for (const [code, duties] of Object.entries(DEMO_DUTIES)) {
  const rows = duties.map((duty) => ({ staff_id: staffId[code], duty }));
  const { error } = await db.from("staff_permissions").upsert(rows, { onConflict: "staff_id,duty", ignoreDuplicates: true });
  if (error) throw new Error(`duties for ${code}: ${error.message}`);
}

// ---- class teachers + subject assignments for the current year's sections
const { data: year } = await db.from("academic_years").select("id, name").eq("is_current", true).maybeSingle();
if (!year) {
  console.log("No current academic year: skipped class teachers and assignments (run npm run seed:school first).");
} else {
  const [{ data: classes }, { data: sections }, { data: subjects }, { data: links }] = await Promise.all([
    db.from("classes").select("id, name"),
    db.from("sections").select("id, class_id, name").eq("academic_year_id", year.id),
    db.from("subjects").select("id, code"),
    db.from("class_subjects").select("class_id, subject_id").eq("academic_year_id", year.id),
  ]);
  const className = Object.fromEntries(classes.map((c) => [c.id, c.name]));
  const subjectCode = Object.fromEntries(subjects.map((s) => [s.id, s.code]));
  let ct = 0;
  const assignments = [];
  for (const sec of sections) {
    const cls = className[sec.class_id];
    const teacherCode = DEMO_CLASS_TEACHERS[cls];
    if (!teacherCode) continue;
    const { error } = await db.from("sections").update({ class_teacher_id: staffId[teacherCode] }).eq("id", sec.id).is("class_teacher_id", null);
    if (error) throw error;
    ct++;
    for (const l of links.filter((l) => l.class_id === sec.class_id)) {
      const code = subjectCode[l.subject_id];
      const who = DEMO_SUBJECT_TEACHERS[code]?.[cls] ?? teacherCode;
      assignments.push({ section_id: sec.id, subject_id: l.subject_id, staff_id: staffId[who] });
    }
  }
  if (assignments.length) {
    const { error } = await db
      .from("teacher_assignments")
      .upsert(assignments, { onConflict: "section_id,subject_id,staff_id", ignoreDuplicates: true });
    if (error) throw error;
  }
  console.log(`${year.name}: class teachers set for ${ct} sections, ${assignments.length} subject assignments.`);
}

console.log("Demo logins (password = DEMO_USER_PASSWORD from .env.local):");
for (const l of logins) console.log("  -", l);

// ---- demo students (~60, fake IDs)
await seedDemoStudents();

// ---- demo fee data (plans mix, concession, payments, one cancelled receipt)
await seedDemoFees();
