import type { Metadata, Viewport } from "next";
import { Cinzel, Noto_Sans, Noto_Sans_Telugu } from "next/font/google";
import { Toaster } from "sonner";
import { getBranding } from "@/lib/branding";
import { DEMO_MODE } from "@/lib/demo";
import { DemoBanner } from "@/components/demo/demo-banner";
import "./globals.css";

const notoSans = Noto_Sans({ variable: "--font-noto-sans", subsets: ["latin"], display: "swap" });
// Telugu script for student / staff names entered in Telugu
const notoTelugu = Noto_Sans_Telugu({ variable: "--font-noto-telugu", subsets: ["telugu"], display: "swap" });
// Display face for the school name only (echoes the serif lettering in the logo)
const cinzel = Cinzel({ variable: "--font-cinzel", subsets: ["latin"], weight: ["600", "700"], display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const { name, shortName } = await getBranding();
  return {
    title: { default: name, template: `%s · ${shortName}` },
    description: `${name}: school management for staff`,
    manifest: "/manifest.webmanifest",
    ...(DEMO_MODE ? { robots: { index: false, follow: false } } : {}),   // the demo is for people with the link, not for search engines
    appleWebApp: { capable: true, title: shortName, statusBarStyle: "black-translucent" },
  };
}

export const viewport: Viewport = { themeColor: "#011a37", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${notoSans.variable} ${notoTelugu.variable} ${cinzel.variable} font-sans antialiased`}>
        {children}
        <DemoBanner />
        <Toaster
          position="top-center"
          richColors
          closeButton
          toastOptions={{ style: { fontFamily: "inherit" } }}
        />
      </body>
    </html>
  );
}
