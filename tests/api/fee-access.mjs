// Fee access through the real API: Admin, and office staff the Admin picks. Never a teacher. Cut off at once.
import { createClient } from "@supabase/supabase-js";

export const name = "fee access: teachers never, office only when granted, cut off at once (demo logins via the API)";

const FEE_TABLES = ["fee_heads", "fee_plans", "fee_plan_installments", "fee_structure", "student_fee_plans", "fee_concessions", "student_fee_dues", "fee_receipts", "fee_receipt_items", "fee_campaigns", "fee_campaign_class_amounts", "fee_campaign_students", "fee_settings"];

async function signIn(url, anon, email, password) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  return error ? null : c;
}
async function readable(c) {
  const out = [];
  for (const t of FEE_TABLES) {
    const { data } = await c.from(t).select("*").limit(1);
    if ((data ?? []).length) out.push(t);
  }
  return out;
}

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, DEMO_USER_PASSWORD: pw } = process.env;
  if (!url || !anon || !service || !pw) return skip("keys missing");
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: fee } = await admin.from("staff").select("id, app_role").eq("employee_code", "DEMO-FEE").maybeSingle();
  const { data: desk } = await admin.from("staff").select("id").eq("employee_code", "DEMO-DESK").maybeSingle();
  if (!fee || !desk) return skip("demo office staff missing (npm run seed:demo)");
  const { count: anyFee } = await admin.from("student_fee_dues").select("id", { count: "exact", head: true });
  if (!anyFee) return skip("no demo fee data (npm run seed:demo-fees)");

  // nobody holds the fee duty except office staff
  const { data: holders } = await admin.from("staff_permissions").select("staff_id, staff(app_role)").eq("duty", "fee_collection");
  ok((holders ?? []).every((h) => h.staff?.app_role === "computer_staff"), "in the data, only office staff hold the fee duty (no teacher, no admin)", JSON.stringify((holders ?? []).filter((h) => h.staff?.app_role !== "computer_staff")));

  const T1 = await signIn(url, anon, "teacher1@demo.kchs.test", pw);
  const OFFT = await signIn(url, anon, "office@demo.kchs.test", pw); // a TEACHER with every other duty
  const FEE = await signIn(url, anon, "fees@demo.kchs.test", pw);
  const DESK = await signIn(url, anon, "desk@demo.kchs.test", pw);
  const ADM = await signIn(url, anon, "admin@demo.kchs.test", pw);
  if (!T1 || !OFFT || !FEE || !DESK || !ADM) return skip("a demo login is missing (npm run seed:demo)");
  const { data: stu } = await admin.from("student_fee_dues").select("student_id").limit(1);
  try {
    ok((await readable(T1)).length === 0, "teacher1: reads no fee table");
    ok((await readable(OFFT)).length === 0, "the teacher with every other duty (office@): reads no fee table", (await readable(OFFT)).join());
    ok((await readable(DESK)).length === 0, "office staff WITHOUT fee access (desk@): reads no fee table");
    ok((await readable(FEE)).length >= 8, "office staff WITH fee access (fees@): reads the fee tables");
    ok((await readable(ADM)).length >= 8, "Admin: reads the fee tables");
    for (const [label, c] of [["teacher1", T1], ["office@ teacher", OFFT], ["desk@ office", DESK]]) {
      const r = await c.rpc("collect_fee", { p_student_id: stu[0].student_id, p_amount_paise: 100, p_mode: "cash" });
      ok(!!r.error, `${label}: cannot collect a fee`, r.error?.message);
      const q = await c.storage.from("payment-qr").list();
      ok((q.data ?? []).length === 0, `${label}: cannot list the payment QR file`);
      const m = await c.from("message_log").select("id").limit(1);
      ok((m.data ?? []).length === 0, `${label}: reads no message log`);
    }
    // the Admin cannot hand the fee duty to a teacher, through the real API either
    const { data: t1 } = await admin.from("staff").select("id").eq("employee_code", "DEMO-T01").single();
    const g = await ADM.from("staff_permissions").insert({ staff_id: t1.id, duty: "fee_collection" });
    ok(!!g.error, "Admin cannot give the fee duty to a teacher", g.error?.message);
    const after = await readable(T1);
    ok(after.length === 0, "and the teacher still reads nothing");

    // grant to the desk clerk, then remove: effect is immediate with the SAME signed-in session
    const grant = await ADM.from("staff_permissions").insert({ staff_id: desk.id, duty: "fee_collection" });
    ok(!grant.error, "Admin grants fee access to the front-office person", grant.error?.message);
    ok((await readable(DESK)).length >= 8, "with the grant (same session): the fee tables open at once");
    const del = await ADM.from("staff_permissions").delete().eq("staff_id", desk.id).eq("duty", "fee_collection").select();
    ok(!del.error && (del.data ?? []).length === 1, "Admin removes the access");
    ok((await readable(DESK)).length === 0, "without the grant (same session): the fee tables are empty at once");
    const c2 = await DESK.rpc("collect_fee", { p_student_id: stu[0].student_id, p_amount_paise: 100, p_mode: "cash" });
    ok(!!c2.error, "and they cannot collect");
  } finally {
    await admin.from("staff_permissions").delete().eq("staff_id", desk.id).eq("duty", "fee_collection");
    for (const c of [T1, OFFT, FEE, DESK, ADM]) await c?.auth.signOut();
  }
}
