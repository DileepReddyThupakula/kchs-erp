// Pages, with the old cookie of a deactivated / removed person. Needs a running app:
//   TEST_APP_URL=http://localhost:3200 npm run test:db -- deactivated-staff-pages     (production build)
import { createClient } from "@supabase/supabase-js";

export const name = "deactivated staff cannot open any page (needs TEST_APP_URL)";

const PAGES = ["/dashboard", "/students", "/students/new", "/my/students", "/fees", "/fees/collect", "/exams/marks", "/exams/results", "/exams/scheme", "/exams/locks", "/staff", "/settings", "/notices", "/diary", "/attendance", "/timetable", "/reports", "/setup"];

export default async function run({ ok, skip }) {
  const app = process.env.TEST_APP_URL;
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, SUPABASE_SERVICE_ROLE_KEY: service } = process.env;
  if (!app) return skip("TEST_APP_URL not set (start `next start` and set it to run the page checks)");
  const admin = createClient(url, service, { auth: { persistSession: false, autoRefreshToken: false } });
  const ref = new URL(url).hostname.split(".")[0];
  const pw = `Tmp-${Math.random().toString(36).slice(2)}-Aa1`;
  const made = [];

  async function cookieFor(role, status) {
    const stamp = `${Date.now()}${made.length}`;
    const email = `pg-${stamp}@demo.kchs.test`;
    const { data: u } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
    const { data: st } = await admin.from("staff").insert({ employee_code: `PG-${stamp}`.slice(0, 30), full_name: "Page Test", app_role: role, user_id: u.user.id, email, status }).select("id").single();
    made.push({ userId: u.user.id, staffId: st.id });
    return { userId: u.user.id, staffId: st.id, email };
  }
  async function sessionCookie(email) {
    const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await c.auth.signInWithPassword({ email, password: pw });
    if (error) throw new Error(error.message);
    const val = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
    const name = `sb-${ref}-auth-token`;
    const parts = val.match(/.{1,3000}/g);
    return parts.length === 1 ? `${name}=${val}` : parts.map((p, i) => `${name}.${i}=${p}`).join("; ");
  }
  const get = (path, cookie) => fetch(`${app}${path}`, { headers: { cookie }, redirect: "manual" });

  try {
    for (const role of ["admin", "teacher"]) {
      const p = await cookieFor(role, "active");
      const cookie = await sessionCookie(p.email); // the old token, kept
      const live = await get("/dashboard", cookie);
      ok(live.status === 200, `[${role}] while active the dashboard opens`, String(live.status));
      // now deactivate: the cookie/token is unchanged
      await admin.from("staff").update({ status: "inactive" }).eq("id", p.staffId);
      const bad = [];
      for (const path of PAGES) {
        const r = await get(path, cookie);
        const loc = r.headers.get("location") ?? "";
        const body = r.status === 200 ? await r.text() : "";
        const leaked = /Aarav|Ananya|Student|Admission/i.test(body);
        if (!(r.status >= 300 && r.status < 400 && /\/login/.test(loc)) || leaked) bad.push(`${path}:${r.status}${leaked ? "+DATA" : ""}`);
      }
      ok(bad.length === 0, `[${role} deactivated] all ${PAGES.length} pages redirect to /login and show no data with the old cookie`, bad.join(", "));
      // removed entirely
      await admin.from("staff").delete().eq("id", p.staffId);
      const bad2 = [];
      for (const path of PAGES.slice(0, 6)) {
        const r = await get(path, cookie);
        if (!(r.status >= 300 && r.status < 400 && /\/login/.test(r.headers.get("location") ?? ""))) bad2.push(`${path}:${r.status}`);
      }
      ok(bad2.length === 0, `[${role} record deleted] pages redirect to /login with the old cookie`, bad2.join(", "));
    }
  } finally {
    for (const m of made) {
      await admin.from("staff").delete().eq("id", m.staffId);
      await admin.auth.admin.deleteUser(m.userId).catch(() => {});
    }
  }
}
