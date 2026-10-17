// Fees through the real Supabase API: no fee data without the fee_collection
// duty (even a class teacher), full read + collect with it. Read-only.
import { createClient } from "@supabase/supabase-js";

export const name = "fees via the API (teacher1 without duty, office staff with fee access)";

async function signIn(url, anon, email, password) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  return error ? null : c;
}

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, DEMO_USER_PASSWORD: pw } = process.env;
  if (!url || !anon || !service || !pw) return skip("Supabase keys or DEMO_USER_PASSWORD missing in .env.local");
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { count: dues } = await admin.from("student_fee_dues").select("id", { count: "exact", head: true });
  if (!dues) return skip("no fee dues yet (seed:school / seed:demo)");
  const { data: one } = await admin.from("student_fee_dues").select("student_id").limit(1);

  const t1 = await signIn(url, anon, "teacher1@demo.kchs.test", pw);
  if (!t1) return skip("could not sign in as teacher1");
  try {
    for (const table of ["student_fee_dues", "fee_receipts", "fee_structure", "fee_concessions", "fee_heads"]) {
      const { data } = await t1.from(table).select("id").limit(5);
      ok((data ?? []).length === 0, `API teacher1 (no duty): no rows in ${table}`);
    }
    const { error } = await t1.rpc("collect_fee", { p_student_id: one[0].student_id, p_amount_paise: 100, p_mode: "cash" });
    ok(!!error, "API teacher1 (no duty): cannot collect a fee");
  } finally {
    await t1.auth.signOut();
  }

  const office = await signIn(url, anon, "fees@demo.kchs.test", pw);
  if (!office) return skip("could not sign in as the fee clerk");
  try {
    const { count } = await office.from("student_fee_dues").select("id", { count: "exact", head: true });
    ok(count === dues, `API office staff (fee access): sees all ${dues} dues`, `got ${count}`);
    const { error: upErr, count: upCount } = await office.from("fee_structure").update({ amount_paise: 1 }, { count: "exact" }).gt("amount_paise", 0);
    ok(!upErr && upCount === 0, "API office staff (fee access): cannot change fee amounts");
    const { error: cancelErr } = await office.rpc("cancel_fee_receipt", { p_receipt_id: "00000000-0000-0000-0000-000000000000", p_reason: "test" });
    ok(!!cancelErr, "API office staff (fee access): cannot cancel receipts");
  } finally {
    await office.auth.signOut();
  }
}
