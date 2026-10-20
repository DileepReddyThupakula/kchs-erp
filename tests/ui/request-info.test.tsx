// Secure sign-in cookies (only over https) and the visitor's address for the failed sign-in throttle (never a forged X-Forwarded-For on Vercel).
import { afterEach, describe, expect, it, vi } from "vitest";
import { authCookieOptions, isHttpsRequest } from "@/lib/auth/cookie-options";
import { clientIp } from "@/lib/auth/client-ip";

const hdr = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
afterEach(() => { vi.restoreAllMocks(); vi.resetModules(); });

describe("the visitor's address", () => {
  const VERCEL = { VERCEL: "1" };
  it("on Vercel it comes from x-vercel-forwarded-for, even when the visitor sends their own X-Forwarded-For", () => {
    expect(clientIp(hdr({ "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "1.2.3.4, 5.6.7.8" }), VERCEL)).toBe("203.0.113.7");
    expect(clientIp(hdr({ "x-vercel-forwarded-for": "203.0.113.7" }), VERCEL)).toBe("203.0.113.7");
  });
  it("on Vercel it falls back to x-real-ip, never to X-Forwarded-For", () => {
    expect(clientIp(hdr({ "x-real-ip": "198.51.100.9", "x-forwarded-for": "1.2.3.4" }), VERCEL)).toBe("198.51.100.9");
    expect(clientIp(hdr({ "x-forwarded-for": "1.2.3.4" }), VERCEL)).toBeUndefined();     // forged value alone: no address at all
    expect(clientIp(hdr({}), VERCEL)).toBeUndefined();
  });
  it("two different forged values give the same answer on Vercel", () => {
    const a = clientIp(hdr({ "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "9.9.9.9" }), VERCEL);
    const b = clientIp(hdr({ "x-vercel-forwarded-for": "203.0.113.7", "x-forwarded-for": "8.8.8.8" }), VERCEL);
    expect(a).toBe(b);
  });
  it("IPv6 is accepted, junk is not", () => {
    expect(clientIp(hdr({ "x-vercel-forwarded-for": "2001:db8::1" }), VERCEL)).toBe("2001:db8::1");
    expect(clientIp(hdr({ "x-vercel-forwarded-for": "not-an-ip", "x-real-ip": "198.51.100.9" }), VERCEL)).toBe("198.51.100.9");
    expect(clientIp(hdr({ "x-vercel-forwarded-for": "<script>" }), VERCEL)).toBeUndefined();
  });
  it("only the first entry of a list is used", () => {
    expect(clientIp(hdr({ "x-vercel-forwarded-for": "203.0.113.7, 10.0.0.1" }), VERCEL)).toBe("203.0.113.7");
  });
  it("elsewhere (a laptop, another proxy) the first X-Forwarded-For entry, then x-real-ip", () => {
    expect(clientIp(hdr({ "x-forwarded-for": "192.0.2.5, 10.0.0.1", "x-real-ip": "198.51.100.9" }), {})).toBe("192.0.2.5");
    expect(clientIp(hdr({ "x-real-ip": "198.51.100.9" }), {})).toBe("198.51.100.9");
    expect(clientIp(hdr({ "x-forwarded-for": "garbage" }), {})).toBeUndefined();
  });
});

describe("Secure only over https", () => {
  it("knows https from x-forwarded-proto, else from the address", () => {
    expect(isHttpsRequest(hdr({ "x-forwarded-proto": "https" }))).toBe(true);
    expect(isHttpsRequest(hdr({ "x-forwarded-proto": "http" }), "https://x.test/")).toBe(false);
    expect(isHttpsRequest(hdr({}), "https://x.test/")).toBe(true);
    expect(isHttpsRequest(hdr({}), "http://localhost:3200/")).toBe(false);
    expect(isHttpsRequest(hdr({}))).toBe(false);
  });
  it("always SameSite=Lax; Secure follows https and keeps the library's other options", () => {
    expect(authCookieOptions({ path: "/", maxAge: 5, httpOnly: false }, true)).toEqual({ path: "/", maxAge: 5, httpOnly: false, sameSite: "lax", secure: true });
    expect(authCookieOptions({ path: "/", sameSite: "none" as const }, false)).toMatchObject({ sameSite: "lax", secure: false });
    expect(authCookieOptions(undefined, true)).toMatchObject({ sameSite: "lax", secure: true });
  });
});

describe("the real cookie writers use it", () => {
  const run = async (proto: string | null) => {
    vi.resetModules();
    const set = vi.fn();
    let captured: { cookies: { setAll: (c: { name: string; value: string; options?: object }[]) => void } } | null = null;
    vi.doMock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set }), headers: async () => hdr(proto ? { "x-forwarded-proto": proto } : {}) }));
    vi.doMock("@supabase/ssr", () => ({ createServerClient: (_u: string, _k: string, o: typeof captured) => { captured = o; return {}; } }));
    vi.doMock("server-only", () => ({}));
    const { createClient } = await import("@/lib/supabase/server");
    await createClient();
    captured!.cookies.setAll([{ name: "sb-x-auth-token", value: "v", options: { path: "/", maxAge: 10 } }]);
    return set.mock.calls[0];
  };
  it("the server client (sign-in, sign-out, password change) sets Secure and SameSite=Lax over https", async () => {
    const [name, , options] = await run("https");
    expect(name).toBe("sb-x-auth-token");
    expect(options).toMatchObject({ secure: true, sameSite: "lax", path: "/", maxAge: 10 });
  });
  it("and plain cookies over http, so local sign-in keeps working", async () => {
    expect((await run("http"))[2]).toMatchObject({ secure: false, sameSite: "lax" });
    expect((await run(null))[2]).toMatchObject({ secure: false, sameSite: "lax" });
  });
  it("the middleware (token refresh on every page) does the same", async () => {
    const out: { name: string; options: object }[] = [];
    let captured: { cookies: { setAll: (c: { name: string; value: string; options?: object }[]) => void } } | null = null;
    vi.doMock("@supabase/ssr", () => ({ createServerClient: (_u: string, _k: string, o: typeof captured) => { captured = o; return { auth: { getClaims: async () => ({ data: { claims: { sub: "u" } } }) }, rpc: async () => ({ data: true }) }; } }));
    vi.doMock("next/server", () => ({
      NextResponse: { next: () => ({ cookies: { set: (name: string, _v: string, options: object) => out.push({ name, options }) } }), redirect: () => ({}) },
    }));
    const { updateSession } = await import("@/lib/supabase/middleware");
    const mk = (proto: string) => ({ headers: hdr({ "x-forwarded-proto": proto }), cookies: { getAll: () => [], set: () => {} }, nextUrl: { pathname: "/dashboard", href: `${proto}://x.test/dashboard`, search: "", clone() { return this; } } });
    await updateSession(mk("https") as never);
    captured!.cookies.setAll([{ name: "sb-x-auth-token", value: "v", options: { path: "/" } }]);
    expect(out[0].options).toMatchObject({ secure: true, sameSite: "lax" });
    out.length = 0;
    await updateSession(mk("http") as never);
    captured!.cookies.setAll([{ name: "sb-x-auth-token", value: "v", options: { path: "/" } }]);
    expect(out[0].options).toMatchObject({ secure: false, sameSite: "lax" });
  });
});
