import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    // when the browser refreshes the session it rewrites the cookie: keep SameSite=Lax and Secure (only over https) exactly like the server does
    { cookieOptions: { sameSite: "lax", secure: typeof location !== "undefined" && location.protocol === "https:" } },
  );
}
