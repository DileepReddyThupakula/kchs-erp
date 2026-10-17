// Measures page load times against a PRODUCTION server (npm run build && KCHS_TRACE=1 npm start -- -p 3200).
// Signs in as a demo user through Supabase, builds the session cookie, then fetches each page several times:
//   - the full page (what a reload costs) and the "soft navigation" payload (what clicking a menu item costs)
//   - with KCHS_TRACE=1 the server prints every Supabase call; this script counts the lines each page produced.
//   node --env-file=.env.local scripts/perf-measure.mjs [baseUrl] [admin|teacher|both] [logFile]
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "node:fs";

const base = process.argv[2] ?? "http://localhost:3200";
const who = process.argv[3] ?? "both";
const logFile = process.argv[4] ?? "/tmp/kchs-prod.log";
const only = process.argv[5]; // optional: print every database call of this one path
const { NEXT_PUBLIC_SUPABASE_URL: url, NEXT_PUBLIC_SUPABASE_ANON_KEY: anon, DEMO_USER_PASSWORD: pw } = process.env;
const ref = new URL(url).hostname.split(".")[0];

async function cookieFor(email) {
  const c = createClient(url, anon, { auth: { persistSession: false } });
  const { data, error } = await c.auth.signInWithPassword({ email, password: pw });
  if (error) throw new Error(error.message);
  const value = "base64-" + Buffer.from(JSON.stringify(data.session)).toString("base64url");
  const name = `sb-${ref}-auth-token`;
  const parts = value.match(/.{1,3180}/g);
  return parts.length === 1 ? `${name}=${value}` : parts.map((p, i) => `${name}.${i}=${p}`).join("; ");
}
const lines = () => (existsSync(logFile) ? readFileSync(logFile, "utf8").split("\n").filter((l) => l.startsWith("[trace]")) : []);

const PAGES = {
  admin: [
    ["Dashboard", "/dashboard"],
    ["Students", "/students"],
    ["Attendance", "/attendance"],
    ["Fees: Collect", "/fees/collect"],
    ["Diary", "/diary/class"],
    ["Notices", "/notices"],
    ["Exams & marks", "/exams/marks"],
    ["Exam results", "/exams/results"],
  ],
  teacher: [
    ["Dashboard", "/dashboard"],
    ["My classes", "/my/classes"],
    ["My students", "/my/students"],
    ["Attendance", "/attendance"],
    ["Diary", "/diary/submit"],
    ["Notices", "/notices"],
    ["Exams & marks", "/exams/marks"],
    ["Exam results", "/exams/results"],
  ],
};
const median = (a) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];

async function run(label, email, pages) {
  const cookie = await cookieFor(email);
  if (only) {
    await fetch(base + only, { headers: { cookie }, redirect: "manual" }).then((r) => r.text()); // warm up
    const before = lines().length;
    const t0 = performance.now();
    const r = await fetch(base + only, { headers: { cookie }, redirect: "manual" });
    await r.text();
    await new Promise((res) => setTimeout(res, 100));
    console.log(`\n${label} ${only}: ${Math.round(performance.now() - t0)} ms total, status ${r.status}`);
    for (const l of lines().slice(before)) console.log(l);
    return;
  }
  console.log(`\n== ${label} (${email}) ==`);
  console.log("page".padEnd(16), "hard load ms (min / median)".padEnd(28), "soft nav ms".padEnd(12), "html KB", "rsc KB", "db calls", "db ms");
  for (const [name, path] of pages) {
    const hard = [];
    let htmlKb = 0;
    let calls = 0;
    let dbMs = 0;
    for (let i = 0; i < 4; i++) {
      const before = lines().length;
      const t0 = performance.now();
      const r = await fetch(base + path, { headers: { cookie }, redirect: "manual" });
      const body = await r.text();
      hard.push(performance.now() - t0);
      if (r.status !== 200) {
        console.log(name.padEnd(16), `HTTP ${r.status} ${r.headers.get("location") ?? ""}`);
        break;
      }
      htmlKb = body.length / 1024;
      await new Promise((res) => setTimeout(res, 60));
      if (i === 1) {
        const mine = lines().slice(before);
        calls = mine.length;
        dbMs = mine.reduce((a, l) => a + Number(/ (\d+)ms /.exec(l)?.[1] ?? 0), 0);
      }
    }
    if (hard.length < 4) continue;
    const soft = [];
    let rscKb = 0;
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      const r = await fetch(base + path + (path.includes("?") ? "&" : "?") + "_rsc=1", { headers: { cookie, RSC: "1", "Next-Router-State-Tree": "%5B%22%22%5D" } });
      const b = await r.text();
      soft.push(performance.now() - t0);
      rscKb = b.length / 1024;
    }
    console.log(name.padEnd(16), `${Math.round(Math.min(...hard))} / ${Math.round(median(hard))}`.padEnd(28), String(Math.round(median(soft))).padEnd(12), htmlKb.toFixed(0).padStart(7), rscKb.toFixed(0).padStart(6), String(calls).padStart(8), String(Math.round(dbMs)).padStart(6));
  }
}
if (who === "admin" || who === "both") await run("Admin", "admin@demo.kchs.test", PAGES.admin);
if (who === "teacher" || who === "both") await run("Teacher", "teacher1@demo.kchs.test", PAGES.teacher);
// dashboards of every kind of person:  node --env-file=.env.local scripts/perf-measure.mjs <base> dashboards
if (who === "dashboards") {
  for (const [label, email] of [["Admin", "admin@demo.kchs.test"], ["Teacher", "teacher1@demo.kchs.test"], ["Office (fees)", "fees@demo.kchs.test"], ["Office (desk)", "desk@demo.kchs.test"]]) {
    await run(label, email, [["Dashboard", "/dashboard"]]);
  }
}
