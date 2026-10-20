import { isIP } from "node:net";

type H = { get(name: string): string | null | undefined };

const first = (v: string | null | undefined) => (v ?? "").split(",")[0]?.trim() ?? "";
const valid = (v: string) => (isIP(v) ? v : undefined);

/**
 * The visitor's address, for the failed sign-in log and its per-IP throttle.
 *  On Vercel (env VERCEL is set): x-vercel-forwarded-for, which Vercel itself sets and which a visitor cannot forge; then x-real-ip (also set by
 *   Vercel). A client-supplied X-Forwarded-For is NEVER read there. If neither is present, no address (the per-IP throttle is skipped; the
 *   per-login-ID throttle and lock still apply).
 *  Anywhere else (a laptop, another host behind a proxy): the first X-Forwarded-For entry, then x-real-ip.
 * Only real IP addresses are accepted.
 */
export function clientIp(h: H, env: Record<string, string | undefined> = process.env): string | undefined {
  if (env.VERCEL) return valid(first(h.get("x-vercel-forwarded-for"))) ?? valid(first(h.get("x-real-ip")));
  return valid(first(h.get("x-forwarded-for"))) ?? valid(first(h.get("x-real-ip")));
}
