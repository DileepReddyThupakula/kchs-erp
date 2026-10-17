import { redirect } from "next/navigation";
import { requireCapability } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { DiaryPrint } from "@/components/notices/print-sheet";
import { getReceiptSchool } from "@/features/fees/receipt-school";
import { getDiaryRows, getSubjectNameMap } from "@/features/notices/queries";
import { fmtLong } from "@/features/notices/shared";
import { getSectionsInfo } from "@/features/timetable/queries";

export const metadata = { title: "Daily diary" };

/** A4 daily diary of one section. What prints is what the signed-in person may see (RLS): teachers get published entries of their own sections only. */
export default async function PrintDiary({ searchParams }: { searchParams: Promise<{ section?: string; date?: string }> }) {
  const sp = await searchParams;
  await requireCapability("notices.edit"); // printing for sharing: Admin and the notices & diary duty only
  const supabase = await createClient();
  const year = await resolveYear();
  if (!year || !/^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "")) redirect("/not-allowed");
  const sections = await getSectionsInfo(supabase, year.id);
  const section = sections.find((s) => s.id === sp.section);
  if (!section) redirect("/not-allowed");
  const subjects = await getSubjectNameMap(supabase);
  const { data: dir } = await supabase.rpc("staff_directory");
  const names = new Map((dir ?? []).map((s) => [s.id, s.full_name]));
  const rows = (await getDiaryRows(supabase, { from: sp.date!, to: sp.date!, sectionLabels: new Map(sections.map((s) => [s.id, { label: s.label, classId: s.classId }])), subjects, names })).filter(
    (r) => r.sectionIds.includes(section.id) && r.status === "published" && !r.archived,
  );
  const school = await getReceiptSchool();
  return (
    <DiaryPrint
      school={school}
      sectionLabel={section.label}
      dateLong={fmtLong(sp.date!)}
      classTeacher={section.classTeacherId ? (names.get(section.classTeacherId) ?? null) : null}
      lines={rows.map((r) => ({ subject: r.subject ?? "Class remark", body: r.body }))}
    />
  );
}
