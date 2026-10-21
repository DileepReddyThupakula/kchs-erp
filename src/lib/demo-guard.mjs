// The public DEMO site (for portfolio and resume) must run only against the DEVELOPMENT project's dummy data. Fail closed:
// demo mode is allowed only if the project it points at is known to be the development project, and never if the production project
// shows up anywhere in the environment.
export const DEMO_ALLOWED_REFS = ["cndkkullvdxwesskbznx"];       // development project: dummy data only
export const PRODUCTION_REFS = ["zxgvxtwtdevlezciymjf"];         // never, in any variable

/** null when fine (or when demo mode is off), else the reason to refuse to start. */
export function demoProblem(env = process.env) {
  if (env.NEXT_PUBLIC_DEMO_MODE !== "true") {
    return null;
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  let ref = null;
  try { ref = new URL(url).hostname.match(/^([a-z]+)\.supabase\.co$/)?.[1] ?? null; } catch { /* unknown */ }
  if (!ref) return "demo mode is on but I cannot tell which Supabase project NEXT_PUBLIC_SUPABASE_URL points at.";
  if (!DEMO_ALLOWED_REFS.includes(ref)) return "demo mode is on but the project is not the development project.";
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string" && PRODUCTION_REFS.some((p) => v.includes(p))) return `demo mode is on and ${k} mentions the PRODUCTION project.`;
  }
  return null;
}
