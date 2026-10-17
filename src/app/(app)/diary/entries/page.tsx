import { requirePage } from "@/features/students/page-guard";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { EmptyState } from "@/components/ui/card";
import { DiaryTable } from "@/components/notices/diary-views";
import { getDiaryRows, getSubjectNameMap, signedLinks, type FileLink } from "@/features/notices/queries";
import { addDaysIso } from "@/features/notices/shared";
import { getSectionsInfo } from "@/features/timetable/queries";
import { todayIst } from "@/features/fees/shared";

export const metadata = { title: "All diary entries" };

export default async function DiaryEntriesPage({ searchParams }: { searchParams: Promise<{ from?: string; to?: string }> }) {
  const sp = await searchParams;
  const me = await requirePage("/diary/entries");
  const supabase = await createClient();
  const isAdmin = me.role === "admin";
  const today = todayIst();
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const year = await resolveYear();
  if (!year) return <EmptyState title="No academic year yet">The Admin hasn&apos;t set up the current academic year.</EmptyState>;
  const [sections, subjects, { data: dir }] = await Promise.all([getSectionsInfo(supabase, year.id), getSubjectNameMap(supabase), supabase.rpc("staff_directory")]);
  if (!sections.length) return <EmptyState title="No sections">Add classes and sections under School setup.</EmptyState>;
  const names = new Map((dir ?? []).map((s) => [s.id, s.full_name]));
  const labels = new Map(sections.map((s) => [s.id, { label: s.label, classId: s.classId }]));
  const subjectOpts = Object.entries(subjects).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  const sectionOpts = sections.map((s) => ({ id: s.id, label: s.label, classId: s.classId }));
  const classOpts = [...new Map(sections.map((s) => [s.classId, { id: s.classId, label: s.className }])).values()];

  const from = iso.test(sp.from ?? "") ? sp.from! : addDaysIso(today, -14);
  const to = iso.test(sp.to ?? "") ? sp.to! : addDaysIso(today, 7);
  const rows = await getDiaryRows(supabase, { from, to, sectionLabels: labels, subjects, names });
  const ids = rows.slice(0, 300).map((r) => r.id);
  const files: Record<string, FileLink[]> = {};
  if (ids.length) {
    const { data } = await supabase.from("diary_attachments").select("id, entry_id, file_path, file_name, mime_type, size_bytes").in("entry_id", ids);
    const links = await signedLinks(supabase, "diary-files", data ?? []);
    (data ?? []).forEach((a, i) => (files[a.entry_id] ??= []).push(links[i]));
  }
  void can;
  return (
    <>
      <form method="get" className="mb-3 flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted">
          From
          <input type="date" name="from" defaultValue={from} className="mt-0.5 block h-10 rounded-lg border border-border bg-surface px-2 text-sm text-foreground" />
        </label>
        <label className="text-xs text-muted">
          To
          <input type="date" name="to" defaultValue={to} className="mt-0.5 block h-10 rounded-lg border border-border bg-surface px-2 text-sm text-foreground" />
        </label>
        <button className="h-10 rounded-lg bg-navy-700 px-4 text-sm font-medium text-white hover:bg-navy-800">Show</button>
        <span className="pb-2 text-sm text-muted">{rows.length} entries</span>
      </form>
      <DiaryTable rows={rows} files={files} canEdit isAdmin={isAdmin} classes={classOpts} sections={sectionOpts} subjects={subjectOpts} />
    </>
  );
}
