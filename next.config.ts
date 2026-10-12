import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : undefined;

const nextConfig: NextConfig = {
  // Lets a second dev server (e.g. Claude's preview) use its own build folder
  // so it never clobbers yours. Default stays ".next".
  distDir: process.env.NEXT_DIST_DIR || ".next",
  images: {
    // School logo uploaded in Settings lives in Supabase Storage (public "branding" bucket)
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/branding/**" }]
      : [],
  },
};

export default nextConfig;
