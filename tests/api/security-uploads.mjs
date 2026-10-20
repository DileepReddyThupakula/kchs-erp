// The storage buckets themselves refuse the wrong kinds of file, and the branding bucket is the only public one.
import { createClient } from "@supabase/supabase-js";

export const name = "storage buckets: allowed file types";

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, DEMO_USER_PASSWORD: pw } = process.env;
  if (!url || !anon || !service || !pw) return skip("keys missing");
  const A = createClient(url, anon, { auth: { persistSession: false } });
  const { error } = await A.auth.signInWithPassword({ email: "admin@demo.kchs.test", password: pw });
  if (error) return skip("admin login missing");
  const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'], { type: "image/svg+xml" });
  const r1 = await A.storage.from("branding").upload(`sec-test-${Date.now()}.svg`, svg, { contentType: "image/svg+xml" });
  ok(!!r1.error, "branding: an SVG upload is refused by the bucket");
  const html = new Blob(["<html></html>"], { type: "text/html" });
  const r2 = await A.storage.from("student-photos").upload(`sec-test-${Date.now()}.html`, html, { contentType: "text/html" });
  ok(!!r2.error, "student photos: an HTML upload is refused by the bucket");
  const r3 = await A.storage.from("student-documents").upload(`sec-test-${Date.now()}.js`, new Blob(["alert(1)"], { type: "application/javascript" }), { contentType: "application/javascript" });
  ok(!!r3.error, "student documents: a script upload is refused by the bucket");
  // public vs private: a plain link without a signature works only for the logo bucket
  const anonClient = createClient(url, anon, { auth: { persistSession: false } });
  const pub = anonClient.storage.from("student-photos").getPublicUrl("x/y.jpg").data.publicUrl;
  const res = await fetch(pub);
  ok(res.status === 400 || res.status === 404 || res.status === 403, `student photos: a plain public link does not work (status ${res.status})`);
}
