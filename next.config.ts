import type { NextConfig } from "next";

const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname : undefined;

const isDev = process.env.NODE_ENV !== "production";
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin : "";
const supabaseWs = supabaseOrigin.replace(/^https/, "wss");

/**
 * Content-Security-Policy. The app only loads its own scripts, styles and fonts; images come from itself, from the school's private
 * Supabase storage (signed links), and from data:/blob: (previews, QR codes); the browser may talk only to itself and Supabase.
 * 'unsafe-inline' for scripts is needed because Next.js writes small inline scripts into every page (a per-request nonce would make every page
 * dynamic); 'unsafe-eval' is only added for the development server. Nothing may frame the app, and no plug-ins (object-src 'none').
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabaseOrigin}`.trim(),
  "font-src 'self' data:",
  `connect-src 'self' ${supabaseOrigin} ${supabaseWs}${isDev ? " ws://localhost:* http://localhost:*" : ""}`.replace(/\s+/g, " ").trim(),
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "media-src 'self' blob:",
  "frame-src 'none'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
];

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
  // Lets a second dev server (e.g. Claude's preview) use its own build folder
  // so it never clobbers yours. Default stays ".next".
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    // student photo (2 MB) + documents (5 MB each) are uploaded with the form
    serverActions: { bodySizeLimit: "25mb" },
  },
  images: {
    // School logo uploaded in Settings lives in Supabase Storage (public "branding" bucket)
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/public/branding/**" }]
      : [],
  },
};

export default nextConfig;
