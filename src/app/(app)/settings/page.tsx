import { requireCapability } from "@/lib/auth/session";
import { getSchoolSettings, publicStorageUrl } from "@/lib/settings";
import { Settings } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { configuredProviderName } from "@/lib/translate/providers";
import { SettingsForm, BrandingUpload } from "./settings-form";

export const metadata = { title: "School settings" };

export default async function SettingsPage() {
  // Admin only (teachers don't see School settings at all).
  await requireCapability("settings.edit");
  const settings = await getSchoolSettings();
  if (!settings) return null;
  const editable = true;
  const supabase = await createClient();
  const { data: usage } = await supabase.rpc("translation_status");
  const used = Number(usage?.[0]?.used ?? 0);
  const cap = Number(usage?.[0]?.cap ?? settings.translation_monthly_cap);
  const provider = configuredProviderName();
  const pct = cap > 0 ? Math.round((used / cap) * 100) : 100;

  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Administration" }, { label: "School settings" }]}
        title="School settings"
        icon={<Settings />}
        description={editable ? "School details used across the ERP, receipts and report cards." : "Only the Admin can change these."}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <SettingsForm settings={settings} editable={editable} />
        <div className="space-y-4">
          <Card>
            <h2 className="mb-2 font-semibold text-navy-900">Translation status</h2>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between gap-2"><dt className="text-muted">Service</dt><dd className="font-medium">{provider ? `${provider === "mock" ? "Test (fake Telugu)" : provider === "azure" ? "Azure Translator" : "Google Cloud Translation"} · connected` : "Not set up (type Telugu by hand)"}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted">This month</dt><dd className="font-medium tabular-nums">{used.toLocaleString("en-IN")} of {cap.toLocaleString("en-IN")}</dd></div>
              <div className="flex justify-between gap-2"><dt className="text-muted">Used</dt><dd className={`font-medium ${pct >= 100 ? "text-red-700" : pct >= 80 ? "text-amber-800" : ""}`}>{pct}%{pct >= 100 ? " · switched off until next month" : pct >= 80 ? " · nearly at the limit" : ""}</dd></div>
            </dl>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-cream-200"><div className={`h-full ${pct >= 100 ? "bg-red-600" : pct >= 80 ? "bg-amber-500" : "bg-peacock-600"}`} style={{ width: `${Math.min(100, pct)}%` }} /></div>
            <p className="mt-2 text-xs text-muted">The keys live in the server environment, never in the browser.</p>
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold text-navy-900">Logo</h2>
            <ImagePreview src={publicStorageUrl("branding", settings.logo_path)} alt="School logo" />
            {editable && <BrandingUpload kind="logo" />}
          </Card>
          <Card>
            <h2 className="mb-2 font-semibold text-navy-900">Principal signature</h2>
            <ImagePreview src={publicStorageUrl("branding", settings.principal_signature_path)} alt="Principal signature" />
            {editable && <BrandingUpload kind="signature" />}
          </Card>
        </div>
      </div>
    </>
  );
}

function ImagePreview({ src, alt }: { src: string | null; alt: string }) {
  if (!src) return <p className="mb-3 text-sm text-muted">Not uploaded yet.</p>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className="mb-3 max-h-36 rounded-lg border border-border bg-white object-contain p-2" />;
}
