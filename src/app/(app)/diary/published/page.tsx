import { requirePage } from "@/features/students/page-guard";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { EmptyState } from "@/components/ui/card";
import { ParamSelect } from "@/components/ui/param-select";
import { MonthPicker } from "@/components/attendance/month-picker";
import { DayView } from "@/components/notices/diary-views";
import { getDiaryRows, getSubjectNameMap, signedLinks, type FileLink } from "@/features/notices/queries";
import { getSectionsInfo } from "@/features/timetable/queries";
import { todayIst } from "@/features/fees/shared";

export const metadata = { title: "Published diary" };

/** The published diary of one section and day. Read only for teachers; printing and sending live in Class diary. */
export default async function PublishedDiaryPage({ searchParams }: { searchParams: Promise<{ date?: string; section?: string }> }) {
  const sp = await searchParams;
  const me = await requirePage("/diary/published");
  const supabase = await createClient();
  const canEdit = can(me, "notices.edit");
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const year = await resolveYear();
  if (!year) return <EmptyState title="No academic year yet">The Admin hasn&apos;t set up the current academic year.</EmptyState>;
  const [sections, subjects, { data: dir }] = await Promise.all([getSectionsInfo(supabase, year.id), getSubjectNameMap(supabase), supabase.rpc("staff_directory")]);
  if (!sections.length) return <EmptyState title="No sections">{canEdit ? "Add classes and sections under School setup." : "You are not assigned to any section yet."}</EmptyState>;
  const names = new Map((dir ?? []).map((s) => [s.id, s.full_name]));
  const labels = new Map(sections.map((s) => [s.id, { label: s.label, classId: s.classId }]));
  const date = iso.test(sp.date ?? "") ? sp.date! : todayIst();
  const section = sections.find((s) => s.id === sp.section) ?? sections[0];
  const rows = (await getDiaryRows(supabase, { from: date, to: date, sectionLabels: labels, subjects, names })).filter((r) => r.sectionIds.includes(section.id) && r.status === "published");
  const files: Record<string, FileLink[]> = {};
  if (rows.length) {
    const { data } = await supabase.from("diary_attachments").select("id, entry_id, file_path, file_name, mime_type, size_bytes").in("entry_id", rows.map((r) => r.id));
    const links = await signedLinks(supabase, "diary-files", data ?? []);
    (data ?? []).forEach((a, i) => (files[a.entry_id] ??= []).push(links[i]));
  }
  return (
    <>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ParamSelect param="section" label="Section" value={section.id} options={sections.map((s) => ({ value: s.id, label: s.label }))} />
        <MonthPicker kind="date" value={date} param="date" tab="day" base="/diary/published" extra={`section=${section.id}`} />
      </div>
      <DayView sectionLabel={section.label} date={date} entries={rows} files={files} canEdit={canEdit} />
    </>
  );
}
