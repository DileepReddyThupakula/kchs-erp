// Edge-safe (the middleware runs on the Edge runtime): no Node-only imports here.
type H = { get(name: string): string | null | undefined };

/** Is this request over HTTPS? (Vercel and most proxies say so in x-forwarded-proto; the address itself is the fallback.) */
export function isHttpsRequest(h: H, url?: string): boolean {
  const proto = h.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  if (proto) return proto === "https";
  return !!url && url.startsWith("https:");
}

/**
 * The cookie options for the sign-in cookies: whatever the library asks for, plus SameSite=Lax always and Secure ONLY over HTTPS.
 * Over plain http (local development, a local production build) a Secure cookie would not be accepted by every browser and sign-in would break.
 */
export function authCookieOptions<T extends object>(options: T | undefined, https: boolean): T & { sameSite: "lax"; secure: boolean } {
  return { ...(options as T), sameSite: "lax", secure: https };
}

