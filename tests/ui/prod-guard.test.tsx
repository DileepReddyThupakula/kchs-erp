// The production safety guard: scripts that seed, wipe, load demo data or run tests refuse anything that is not the development project, and fail closed.
import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEV_REFS, PROD_REFS, devOnlyProblem, targetRefs } from "../../scripts/lib/prod-guard.mjs";

const root = path.resolve(__dirname, "../..");
const DEV = DEV_REFS[0];
const FAKE = "abcdefghijklmnopqrst";                      // a made-up 20-letter project id standing for production
const envFor = (ref: string) => ({
  NEXT_PUBLIC_SUPABASE_URL: `https://${ref}.supabase.co`,
  DATABASE_URL: `postgresql://postgres.${ref}:x@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`,
  SUPABASE_SERVICE_ROLE_KEY: "x", NEXT_PUBLIC_SUPABASE_ANON_KEY: "x", DEMO_USER_PASSWORD: "x",
});
const run = (args: string[], env: Record<string, string>, cwd = root) =>
  spawnSync(process.execPath, args, { cwd, env: { PATH: process.env.PATH ?? "", ...env }, encoding: "utf8", timeout: 20000 });

describe("which project does the environment point at", () => {
  it("accepts only the development project", () => {
    expect(devOnlyProblem(envFor(DEV))).toBeNull();
    expect(devOnlyProblem(envFor(FAKE))).toMatch(/does not point at the development project/);
  });
  it("fails closed: nothing known, odd addresses, or two settings that disagree are all refused", () => {
    expect(devOnlyProblem({})).toMatch(/cannot tell/);
    expect(devOnlyProblem({ NEXT_PUBLIC_SUPABASE_URL: "https://example.com" })).toMatch(/cannot tell/);
    expect(devOnlyProblem({ DATABASE_URL: "postgresql://u:p@db.example.org:5432/x" })).toMatch(/cannot tell/);
    expect(devOnlyProblem({ DATABASE_URL: "not a url" })).toMatch(/cannot tell/);
    expect(devOnlyProblem({ ...envFor(DEV), DATABASE_URL: envFor(FAKE).DATABASE_URL })).toMatch(/does not point at the development project/);
    expect(devOnlyProblem({ ...envFor(DEV), KCHS_ENV: "production" })).toMatch(/production/);
  });
  it("reads the project from the API address and from the database connection (pooler or direct)", () => {
    expect(targetRefs(envFor(FAKE)).refs).toEqual([FAKE]);
    expect(targetRefs({ DATABASE_URL: `postgresql://postgres:x@db.${FAKE}.supabase.co:5432/postgres` }).refs).toEqual([FAKE]);
  });
  it("names production clearly once its id is listed", () => {
    PROD_REFS.push(FAKE);
    try { expect(devOnlyProblem(envFor(FAKE))).toMatch(/PRODUCTION project/); } finally { PROD_REFS.pop(); }
  });
});

const GUARDED = [
  "scripts/seed-school.mjs", "scripts/seed-demo.mjs", "scripts/wipe-demo.mjs", "scripts/demo-attendance.mjs", "scripts/demo-bulk-students.mjs", "scripts/demo-data.mjs", "scripts/demo-exams.mjs",
  "scripts/demo-fees.mjs", "scripts/demo-notices.mjs", "scripts/demo-students.mjs", "scripts/demo-timetable.mjs", "scripts/set-logo.mjs", "scripts/test-db.mjs", "scripts/perf-measure.mjs",
  "scripts/dev/q.mjs", "scripts/dev/explain-as.mjs", "scripts/dev/exam-snapshot.mjs", "scripts/dev/check-demo-clean.mjs", "scripts/apply-migration.mjs", "scripts/backup/db.mjs", "scripts/backup/files.mjs",
];
describe("every seed / wipe / demo / test script refuses production", () => {
  for (const f of GUARDED) {
    it(`${f}: refuses a production-looking target and an unknown target`, () => {
      for (const env of [envFor(FAKE), {}]) {
        const r = run([f, "--all", "x"], env);
        expect(r.status, `${f} ${JSON.stringify(Object.keys(env))}`).toBe(1);
        expect(r.stderr).toMatch(/Production safety guard/);
      }
    });
  }
  it("no script is missing the guard (a new script cannot forget it)", () => {
    const EXEMPT = new Set(["brand-icons.mjs", "secret-scan.mjs"]);   // no database, no data
    const files = [
      ...fs.readdirSync(path.join(root, "scripts")).filter((f) => f.endsWith(".mjs")).map((f) => `scripts/${f}`),
      ...fs.readdirSync(path.join(root, "scripts/dev")).filter((f) => f.endsWith(".mjs")).map((f) => `scripts/dev/${f}`),
      "scripts/backup/db.mjs", "scripts/backup/files.mjs",
    ].filter((f) => !EXEMPT.has(path.basename(f)));
    const missing = files.filter((f) => !fs.readFileSync(path.join(root, f), "utf8").includes("prod-guard"));
    expect(missing).toEqual([]);
  });
});

describe("--production is deliberate", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kchs-guard-"));
  const guard = path.join(root, "scripts/lib/prod-guard.mjs");
  const probe = `import { useTarget } from ${JSON.stringify(guard)}; const t = await useTarget("probe", { confirm: false }); console.log(t, process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");`;
  const probeFile = path.join(tmp, "probe.mjs");
  fs.writeFileSync(probeFile, probe);
  const withFile = (text: string | null, devEnv = envFor(DEV)) => {
    const f = path.join(tmp, ".env.production.local");
    fs.rmSync(f, { force: true });
    if (text !== null) fs.writeFileSync(f, text);
    return run([probeFile, "--production"], devEnv, tmp);
  };
  const prodFile = (ref: string, extra = "") => `KCHS_ENV=production\nNEXT_PUBLIC_SUPABASE_URL=https://${ref}.supabase.co\nDATABASE_URL=postgresql://postgres.${ref}:y@aws-0-ap-south-1.pooler.supabase.com:5432/postgres\nSUPABASE_SERVICE_ROLE_KEY=prodkey\n${extra}`;

  it("without --production, a production target is refused even by the scripts that can go there", () => {
    const r = run([probeFile], envFor(FAKE), tmp);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/Production safety guard/);
  });
  it("refuses when the production file is missing, not marked production, points at dev, or disagrees with itself", () => {
    expect(withFile(null).status).toBe(1);
    expect(withFile(prodFile(FAKE).replace("KCHS_ENV=production\n", "")).status).toBe(1);
    expect(withFile(prodFile(DEV)).status).toBe(1);
    expect(withFile(prodFile(FAKE).replace(`postgres.${FAKE}`, "postgres.zzzzzzzzzzzzzzzzzzzz")).status).toBe(1);
    expect(withFile(prodFile(FAKE).replace(/DATABASE_URL=.*\n/, "")).status).toBe(0);   // one setting alone is enough to name the project
  });
  it("with a good production file, it uses ONLY that file: the development keys in the environment are dropped", () => {
    const r = withFile(prodFile(FAKE));
    expect(r.status).toBe(0);
    expect(r.stdout.trim()).toBe(`production https://${FAKE}.supabase.co prodkey`);
  });
});
