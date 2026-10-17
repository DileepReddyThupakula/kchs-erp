/**
 * Optional request tracing for performance measurements: set KCHS_TRACE=1 and every call the server makes to
 * Supabase is printed with its duration and size. Off by default (no cost, nothing logged).
 */
export const tracedFetch: typeof fetch | undefined =
  process.env.KCHS_TRACE === "1"
    ? async (input, init) => {
        const t0 = performance.now();
        const res = await fetch(input, init);
        const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
        const path = url.pathname.replace(/^\/(rest|auth|storage)\/v1\//, "$1:") + (url.search ? url.search.slice(0, 70) : "");
        console.log(`[trace] ${(init?.method ?? "GET").padEnd(4)} ${Math.round(performance.now() - t0)}ms ${res.headers.get("content-length") ?? "?"}B ${path}`);
        return res;
      }
    : undefined;
