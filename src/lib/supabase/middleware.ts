import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { tracedFetch } from "./trace";

const PUBLIC_PATHS = ["/login"];
/** Fee pages: Admin and office staff with fee access only. Checked here, before anything renders, so a refused person gets a real
 *  redirect and not even the page title is sent. (The pages, and the database, check again.) */
const FEE_PATHS = ["/fees", "/reports/fees", "/print/receipt", "/print/report/fee-"];
const ADMIN_ONLY_FEE_PATHS = ["/fees/setup", "/fees/concessions"];
const startsWithAny = (path: string, list: string[]) => list.some((p) => path === p || path.startsWith(p.endsWith("-") ? p : `${p}/`) || path.startsWith(`${p}?`));

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(tracedFetch ? { global: { fetch: tracedFetch } } : {}),
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (toSet) => {
          toSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          toSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  // The sign-in token is verified here from its signature (no round trip to Supabase on every click).
  // The database still checks the person on every query: a deactivated staff member gets no rows.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims ?? null;

  const isPublic = PUBLIC_PATHS.some((p) => request.nextUrl.pathname.startsWith(p));
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const path = request.nextUrl.pathname;
  if (user && startsWithAny(path, FEE_PATHS)) {
    const adminOnly = startsWithAny(path, ADMIN_ONLY_FEE_PATHS);
    const { data: allowed } = adminOnly ? await supabase.rpc("my_role").then((r) => ({ data: r.data === "admin" })) : await supabase.rpc("has_duty", { p_duty: "fee_collection" });
    if (allowed !== true) {
      const url = request.nextUrl.clone();
      url.pathname = "/not-allowed";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }
  return response;
}
