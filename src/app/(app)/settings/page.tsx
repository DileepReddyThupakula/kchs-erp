import { requireCapability } from "@/lib/auth/session";
import { getSchoolSettings, publicStorageUrl } from "@/lib/settings";
import { Settings } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/card";
import { SettingsForm, BrandingUpload } from "./settings-form";

export const metadata = { title: "School settings" };

export default async function SettingsPage() {
  // Admin only (teachers don't see School settings at all).
  await requireCapability("settings.edit");
  const settings = await getSchoolSettings();
  if (!settings) return null;
  const editable = true;

  return (
    <>
      <PageHeader
        title="School settings"
        icon={<Settings />}
        description={editable ? "School details used across the ERP, receipts and report cards." : "Only the Admin can change these."}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
        <SettingsForm settings={settings} editable={editable} />
        <div className="space-y-4">
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
