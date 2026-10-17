// Changing the grading scale through the real API (as the Scheme screen does): open results change, locked results keep their grades.
// Restores the scale afterwards. Needs demo exam data (npm run seed:demo-exams).
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

export const name = "grading scale change vs locked results (Admin, via the API)";

export default async function run({ ok, skip }) {
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service, DEMO_USER_PASSWORD: pw } = process.env;
  if (!url || !anon || !service || !pw) return skip("keys missing");
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: locked } = await admin.from("result_groups").select("id").not("locked_at", "is", null).eq("kind", "term").limit(50);
  const { data: open } = await admin.from("result_groups").select("id").is("locked_at", null).eq("kind", "term").limit(50);
  if (!locked?.length || !open?.length) return skip("needs one locked and one open term (seed:demo-exams)");
  const A = createClient(url, anon, { auth: { persistSession: false } });
  const { error: se } = await A.auth.signInWithPassword({ email: "admin@demo.kchs.test", password: pw });
  if (se) return skip("cannot sign in as admin");

  const hash = async (ids) => {
    const { data } = await admin.from("subject_results").select("id, grade, pct").in("group_id", ids).order("id").limit(5000);
    return createHash("md5").update(JSON.stringify(data)).digest("hex");
  };
  const { data: bands } = await admin.from("grade_bands").select("grade, min_pct, max_pct, grade_point, is_fail").order("min_pct", { ascending: false });
  const orig = bands.map((b) => ({ grade: b.grade, min_pct: Number(b.min_pct), max_pct: Number(b.max_pct), grade_point: Number(b.grade_point), is_fail: b.is_fail }));
  const lockedIds = locked.map((g) => g.id), openIds = open.map((g) => g.id);
  const l0 = await hash(lockedIds), o0 = await hash(openIds);
  try {
    // move the A1/A2 boundary from 91 to 86
    const changed = orig.map((b) => (b.grade === "A1" ? { ...b, min_pct: 86 } : b.grade === "A2" ? { ...b, max_pct: 85 } : b));
    const r = await A.rpc("save_grade_bands", { p: changed });
    ok(!r.error, "Admin can save a changed grading scale through the API (works under the API's safe-update rule)", r.error?.message);
    const l1 = await hash(lockedIds), o1 = await hash(openIds);
    ok(l1 === l0, "locked results did not change at all");
    ok(o1 !== o0, "open results were recalculated with the new scale");
    const { data: stored } = await admin.from("grade_bands").select("grade").order("min_pct", { ascending: false });
    ok(stored.length === orig.length, "the scale still has all its grades");
  } finally {
    const back = await A.rpc("save_grade_bands", { p: orig });
    ok(!back.error, "the original scale was restored", back.error?.message);
    ok((await hash(lockedIds)) === l0 && (await hash(openIds)) === o0, "after restoring, locked and open results are exactly as before");
    await A.auth.signOut();
  }
}
