// Pages of the reports and fees, opened with each person's real session. Needs a running app:
//   TEST_APP_URL=http://localhost:3200 npm run test:db -- report-pages        (production build)
import { createClient } from "@supabase/supabase-js";

export const name = "report and fee pages by person (needs TEST_APP_URL)";

const FEE_PAGES = ["/reports/fees", "/fees/collect", "/fees/dues", "/fees/reports", "/fees/receipts", "/print/report/fee-monthly", "/print/report/fee-dues-class", "/print/report/fee-concessions"];
const ADMIN_ONLY_FEE_PAGES = ["/fees/concessions", "/fees/setup"]; // not even for office staff with fee access
const WHO = [["teacher1", false], ["office", false], ["desk", false], ["fees", true], ["admin", true]];

export default async function run({ ok, skip }) {
  const app = process.env.TEST_APP_URL;
  const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, DEMO_USER_PASSWORD: pw } = process.env;
  if (!app) return skip("TEST_APP_URL not set");
  const ref = new URL(url).hostname.split(".")[0];
  async function cookie(user) {
    const c = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await c.auth.signInWithPassword({ email: `${user}@demo.kchs.test`, password: pw });
    if (error) throw new Error(`${user}: ${error.message}`);
    const val = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
    const parts = val.match(/.{1,3000}/g);
    return parts.map((p, i) => `sb-${ref}-auth-token${parts.length > 1 ? `.${i}` : ""}=${p}`).join("; ");
  }
  // A page behind a loading screen answers 200 with a redirect instruction inside (Next streams it); a print page answers 307.
  // "Blocked" = redirected to /not-allowed AND no fee figures / names in what was sent.
  const get = async (path, ck) => {
    const r = await fetch(app + path, { headers: { cookie: ck }, redirect: "manual" });
    const loc = r.headers.get("location") ?? "";
    const body = await r.text();
    const redirected = (r.status >= 300 && r.status < 400 && /not-allowed|login/.test(loc)) || (r.status === 200 && /NEXT_REDIRECT/.test(body) && /not-allowed/.test(body));
    const leaked = /₹\s?\d|Outstanding|Overdue|Collected|Cancelled amount/.test(body.replace(/<title>[^<]*<\/title>/g, ""));
    // fee pages must be refused BEFORE anything renders: a real HTTP redirect, and no fee page title anywhere in what was sent
    const realRedirect = r.status >= 300 && r.status < 400 && /not-allowed|login/.test(loc) && !/Fee summary|Collect fee|Fee reports|Dues|Receipts|Fee setup|Concessions/i.test(body);
    return { status: r.status, blocked: redirected && !leaked, realRedirect, opened: r.status === 200 && !redirected, body };
  };
  for (const [user, hasFee] of WHO) {
    const ck = await cookie(user);
    const bad = [];
    for (const p of FEE_PAGES) {
      const r = await get(p, ck);
      if (hasFee ? !r.opened : !r.realRedirect) bad.push(`${p}:${r.status}`);
    }
    ok(bad.length === 0, `${user}: fee pages typed directly are ${hasFee ? "open" : "refused with a real redirect, no fee title sent"}`, bad.join(", "));
    // what the hub and the menu show
    const hub = (await get("/reports", ck)).body;
    ok(hasFee ? /Fee summary/.test(hub) : !/Fee summary|Collection by day|Dues and defaulters|Receipts/.test(hub), `${user}: the Reports hub ${hasFee ? "lists" : "does not list"} fee reports`);
    const dash = (await get("/dashboard", ck)).body;
    ok(hasFee || !/href="\/fees\//.test(dash), `${user}: no link to a fee page anywhere on the dashboard / menu`);
  }
  for (const user of ["fees", "teacher1", "desk"]) {
    const ck = await cookie(user);
    const bad = [];
    for (const p of ADMIN_ONLY_FEE_PAGES) if (!(await get(p, ck)).realRedirect) bad.push(p);
    ok(bad.length === 0, `${user}: the Admin-only fee pages (setup, concessions) are blocked`, bad.join(", "));
  }
  // other reports follow the duty too
  const t = await cookie("teacher1");
  for (const p of ["/reports/staff", "/print/report/staff-attendance", "/reports/government-export"]) {
    const r = await get(p, t);
    ok(r.blocked, `teacher1: ${p} is blocked`, String(r.status));
  }
  for (const p of ["/reports", "/reports/strength", "/reports/exams", "/reports/my-load"]) ok((await get(p, t)).opened, `teacher1: ${p} opens`);
  const d = await cookie("desk");
  ok((await get("/reports/strength?tab=demographics", d)).opened, "desk (student_records): demographics opens");
  const a = await cookie("admin");
  for (const p of ["/reports/strength?tab=demographics", "/reports/strength?tab=admissions", "/reports/fees?tab=fee-monthly", "/reports/exams?tab=sections", "/reports/staff", "/print/report/strength", "/print/report/staff-attendance"]) ok((await get(p, a)).opened, `admin: ${p} opens`);
}
