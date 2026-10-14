// School UPI / QR settings and payment rules through the real Supabase API (read-only).
import { createClient } from "@supabase/supabase-js";

export const name = "payment settings via the API (teacher1 without duty, office teacher with duty)";

async function signIn(url, anon, email, password) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await c.auth.signInWithPassword({ email, password });
  return error ? null : c;
}

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, DEMO_USER_PASSWORD: pw } = process.env;
  if (!url || !anon || !pw) return skip("Supabase keys or DEMO_USER_PASSWORD missing");
  const t1 = await signIn(url, anon, "teacher1@demo.kchs.test", pw);
  if (!t1) return skip("could not sign in as teacher1");
  try {
    const { data } = await t1.from("fee_settings").select("*");
    ok((data ?? []).length === 0, "API teacher1 (no duty): cannot read the payment settings");
    const { data: files } = await t1.storage.from("payment-qr").list();
    ok((files ?? []).length === 0, "API teacher1 (no duty): cannot list the QR image");
  } finally {
    await t1.auth.signOut();
  }
  const office = await signIn(url, anon, "office@demo.kchs.test", pw);
  if (!office) return skip("could not sign in as office teacher");
  try {
    const { data } = await office.from("fee_settings").select("upi_id, payee_name, require_upi_reference");
    ok((data ?? []).length === 1, "API office teacher (fee duty): can read the settings to show the QR");
    const { data: upd, error } = await office.from("fee_settings").update({ upi_id: "hacker@upi" }).eq("id", 1).select();
    ok(!error && (upd ?? []).length === 0, "API office teacher: cannot change the UPI id");
    const { error: upErr } = await office.storage.from("payment-qr").upload(`hack-${Date.now()}.png`, new Blob([new Uint8Array([1])], { type: "image/png" }), { contentType: "image/png" });
    ok(!!upErr, "API office teacher: cannot upload a QR image");
    const { data: after } = await office.from("fee_settings").select("upi_id");
    ok(after?.[0]?.upi_id !== "hacker@upi", "the UPI id is unchanged");
  } finally {
    await office.auth.signOut();
  }
}
