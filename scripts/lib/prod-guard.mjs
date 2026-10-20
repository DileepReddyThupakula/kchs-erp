// The PRODUCTION safety guard. Every script that seeds, wipes, resets, loads demo or test data, or runs tests refuses to run unless
// it can PROVE it is aimed at the development project. It fails CLOSED: if the target cannot be worked out, it refuses.
//
//  assertDevOnly(name)        seed / wipe / demo / test scripts: only the dev project (or a local database) is allowed.
//  useTarget(name, {write})   scripts that may be pointed at production ON PURPOSE (backup, migrations, the demo check):
//                             without --production they behave like assertDevOnly; with --production they load .env.production.local
//                             (and ignore .env.local completely) and require that the target is NOT a development project.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline/promises";

/** Projects where seeding, wiping and tests are allowed. Anything else is refused. (The project ID is not a secret.) */
export const DEV_REFS = ["cndkkullvdxwesskbznx"];
/** The production project(s): used only to give a clearer message; refusal does not depend on this list. */
export const PROD_REFS = [];
export const PROD_FILE = ".env.production.local";
const SECRET_KEYS = ["DATABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "DEMO_USER_PASSWORD", "KCHS_ENV"];

const REF = /^[a-z]{20}$/;
/** The project ids the environment points at (from the API address and from the database connection string). */
export function targetRefs(env = process.env) {
  const refs = new Set();
  let unknown = false;
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  if (url) {
    try { const m = new URL(url).hostname.match(/^([a-z]+)\.supabase\.co$/); m ? refs.add(m[1]) : (unknown = true); } catch { unknown = true; }
  }
  const db = env.DATABASE_URL;
  if (db) {
    try {
      const u = new URL(db);
      const user = decodeURIComponent(u.username);
      const m1 = user.match(/^postgres\.([a-z]+)$/), m2 = u.hostname.match(/^db\.([a-z]+)\.supabase\.co$/);
      if (m1) refs.add(m1[1]); else if (m2) refs.add(m2[1]);
      else if (!["localhost", "127.0.0.1", "::1"].includes(u.hostname)) unknown = true;
    } catch { unknown = true; }
  }
  return { refs: [...refs], unknown };
}

function refuse(name, why) {
  console.error(`\nSTOP (${name}): ${why}\nProduction safety guard: nothing was done.\n`);
  process.exit(1);
}

/** Pure decision, so it can be tested: returns null when the environment is certainly the development project, else the reason to refuse. */
export function devOnlyProblem(env = process.env) {
  if (env.KCHS_ENV === "production") return "this Terminal is set to production (KCHS_ENV=production).";
  const { refs, unknown } = targetRefs(env);
  if (unknown) return "I cannot tell which project this points at.";
  if (!refs.length) return "I cannot tell which project this points at (no project address or database connection found).";
  const prod = refs.find((r) => PROD_REFS.includes(r));
  if (prod) return "this points at the PRODUCTION project.";
  const other = refs.find((r) => !DEV_REFS.includes(r));
  if (other) return "this does not point at the development project.";
  return null;
}

export function assertDevOnly(name, env = process.env) {
  const why = devOnlyProblem(env);
  if (why) refuse(name, `refused because ${why}\nThis script only ever runs against the development project.`);
}

/** Loads .env.production.local for this run only. Ignores whatever .env.local put in the environment. */
export function loadProductionEnv(name) {
  const file = path.resolve(process.cwd(), PROD_FILE);
  if (!fs.existsSync(file)) refuse(name, `${PROD_FILE} was not found in the project folder.`);
  for (const k of SECRET_KEYS) delete process.env[k];
  process.loadEnvFile(file);
  const env = process.env;
  if (env.KCHS_ENV !== "production") refuse(name, `${PROD_FILE} must contain KCHS_ENV=production.`);
  const { refs, unknown } = targetRefs(env);
  if (unknown || refs.length !== 1) refuse(name, "I cannot tell, or the two settings disagree on, which project the production file points at. Check NEXT_PUBLIC_SUPABASE_URL and DATABASE_URL in it.");
  if (!REF.test(refs[0])) refuse(name, "the project id in the production file does not look right.");
  if (DEV_REFS.includes(refs[0])) refuse(name, "the production file points at the DEVELOPMENT project.");
  return refs[0];
}

/**
 * For scripts that may be aimed at production on purpose.
 *   no --production : same as assertDevOnly.
 *   --production    : production file only; asks to type the project id unless `confirm: false`.
 * Returns "dev" or "production".
 */
export async function useTarget(name, { confirm = true } = {}) {
  if (!process.argv.includes("--production")) { assertDevOnly(name); return "dev"; }
  const ref = loadProductionEnv(name);
  console.error(`\n*** ${name}: PRODUCTION project ${ref.slice(0, 4)}…${ref.slice(-4)} ***`);
  if (confirm) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    const a = (await rl.question(`Type the last 4 letters of the project id (${ref.slice(-4)}) to continue: `)).trim();
    rl.close();
    if (a !== ref.slice(-4)) refuse(name, "not confirmed.");
  }
  return "production";
}
