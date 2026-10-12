import type { MetadataRoute } from "next";
import { getBranding } from "@/lib/branding";

// Re-read the school name from Settings at most once an hour.
export const revalidate = 3600;

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { name, shortName } = await getBranding();
  return {
    name,
    short_name: shortName,
    description: `${name}: school management for staff`,
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#fffcf5",
    theme_color: "#011a37",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
