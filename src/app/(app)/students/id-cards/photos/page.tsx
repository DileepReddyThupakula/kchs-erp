import { Camera } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui/card";
import { BulkPhotos } from "@/components/id-cards/bulk-photos";
import type { SectionOption } from "@/features/id-cards/shared";

export const metadata = { title: "Student photos" };

export default async function PhotosPage() {
  await requirePage("/students/id-cards");
  const supabase = await createClient();
  const { data } = await supabase.rpc("id_card_sections");
  const j = (data as unknown as { sections: SectionOption[] } | null) ?? { sections: [] };
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Students" }, { label: "ID cards", href: "/students/id-cards" }, { label: "Photos" }]} icon={<Camera />} title="Student photos" description="Upload many photos at once. You see a preview and any problems before anything is saved." />
      <BulkPhotos sections={j.sections} />
    </>
  );
}
