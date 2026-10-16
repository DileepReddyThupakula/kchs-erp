import { NotebookPen } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getSchoolSettings, resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { LinkTabs } from "@/components/ui/tabs";
import { ParamSelect } from "@/components/ui/param-select";
import { MonthPicker } from "@/components/attendance/month-picker";
import { DayView, DiaryTable } from "@/components/notices/diary-views";
import { DiaryQuick, type PriorEntry } from "@/components/notices/diary-quick";
import { getDiaryRows, getSubjectNameMap, signedLinks, type FileLink } from "@/features/notices/queries";
import { addDaysIso } from "@/features/notices/shared";
import { getSectionsInfo } from "@/features/timetable/queries";
import { todayIst } from "@/features/fees/shared";

export const metadata = { title: "Diary" };

export default async function DiaryPage({ searchParams }: { searchParams: Promise<{ tab?: string; date?: string; section?: string; from?: string; to?: string; class?: string }> }) {
  const sp = await searchParams;
  const me = await requirePage("/diary");
  const supabase = await createClient();
  const canEdit = can(me, "notices.edit");
  const isAdmin = me.role === "admin";
  const today = todayIst();
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  const tab = sp.tab === "entries" || (sp.tab === "quick" && canEdit) ? sp.tab : "day";
  const year = await resolveYear();
  const header = <PageHeader breadcrumbs={[{ label: "Academics" }, { label: "Diary" }]} icon={<NotebookPen />} title="Diary" description={canEdit ? "Daily homework and remarks for each class. Quick entry saves a whole day at once." : "The daily diary of the sections you teach."} />;
  if (!year) return <>{header}<EmptyState title="No academic year yet">The Admin hasn&apos;t set up the current academic year.</EmptyState></>;

  const [sections, subjects, settings, { data: dir }] = await Promise.all([getSectionsInfo(supabase, year.id), getSubjectNameMap(supabase), getSchoolSettings(), supabase.rpc("staff_directory")]);
  const names = new Map((dir ?? []).map((s) => [s.id, s.full_name]));
  const labels = new Map(sections.map((s) => [s.id, { label: s.label, classId: s.classId }]));
  const tabs = (
    <LinkTabs
      current={tab}
      tabs={[
        { id: "day", label: "Day view", href: "/diary" },
        { id: "entries", label: "All entries", href: "/diary?tab=entries" },
        ...(canEdit ? [{ id: "quick", label: "Quick entry", href: "/diary?tab=quick" }] : []),
      ]}
    />
  );
  if (!sections.length) return <>{header}{tabs}<EmptyState title="No sections">{canEdit ? "Add classes and sections under School setup." : "You are not assigned to any section yet."}</EmptyState></>;

  const subjectOpts = Object.entries(subjects).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  const sectionOpts = sections.map((s) => ({ id: s.id, label: s.label, classId: s.classId }));
  const classOpts = [...new Map(sections.map((s) => [s.classId, { id: s.classId, label: s.className }])).values()];

  async function attachmentsFor(ids: string[]): Promise<Record<string, FileLink[]>> {
    if (!ids.length) return {};
    const { data } = await supabase.from("diary_attachments").select("id, entry_id, file_path, file_name, mime_type, size_bytes").in("entry_id", ids);
    const links = await signedLinks(supabase, "diary-files", data ?? []);
    const out: Record<string, FileLink[]> = {};
    (data ?? []).forEach((a, i) => (out[a.entry_id] ??= []).push(links[i]));
    return out;
  }

  if (tab === "quick") {
    const date = iso.test(sp.date ?? "") ? sp.date! : today;
    const { data: cs } = await supabase.from("class_subjects").select("class_id, subject_id, sort_order").eq("academic_year_id", year.id).order("sort_order");
    const classes = classOpts.map((c) => ({
      id: c.id,
      name: c.label,
      sections: sections.filter((s) => s.classId === c.id).map((s) => ({ id: s.id, label: s.label })),
      subjects: (cs ?? []).filter((x) => x.class_id === c.id && subjects[x.subject_id]).map((x) => ({ id: x.subject_id, name: subjects[x.subject_id] })),
    }));
    const earlier = await getDiaryRows(supabase, { from: addDaysIso(date, -14), to: addDaysIso(date, 0), sectionLabels: labels, subjects, names });
    const prior: PriorEntry[] = earlier.filter((e) => !e.archived).map((e) => ({ classId: e.classIds[0] ?? "", sectionIds: e.sectionIds, subjectId: e.subjectId, body: e.body, date: e.date }));
    return (
      <>
        {header}
        {tabs}
        <DiaryQuick key={`${date}-${sp.class ?? ""}`} classes={classes} initialDate={date} initialClassId={sp.class} prior={prior} />
      </>
    );
  }

  if (tab === "entries") {
    const from = iso.test(sp.from ?? "") ? sp.from! : addDaysIso(today, -14);
    const to = iso.test(sp.to ?? "") ? sp.to! : today;
    const rows = await getDiaryRows(supabase, { from, to, sectionLabels: labels, subjects, names });
    const files = await attachmentsFor(rows.slice(0, 300).map((r) => r.id));
    return (
      <>
        {header}
        {tabs}
        <form method="get" className="mb-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="tab" value="entries" />
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
        <DiaryTable rows={rows} files={files} canEdit={canEdit} isAdmin={isAdmin} classes={classOpts} sections={sectionOpts} subjects={subjectOpts} />
      </>
    );
  }

  const date = iso.test(sp.date ?? "") ? sp.date! : today;
  const section = sections.find((s) => s.id === sp.section) ?? sections[0];
  const rows = (await getDiaryRows(supabase, { from: date, to: date, sectionLabels: labels, subjects, names })).filter((r) => r.sectionIds.includes(section.id));
  const files = await attachmentsFor(rows.map((r) => r.id));
  return (
    <>
      {header}
      {tabs}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <ParamSelect param="section" label="Section" value={section.id} options={sections.map((s) => ({ value: s.id, label: s.label }))} />
        <MonthPicker kind="date" value={date} param="date" tab="day" base="/diary" extra={`section=${section.id}`} />
      </div>
      <DayView
        school={settings?.name ?? "School"}
        sectionLabel={section.label}
        date={date}
        entries={rows}
        files={files}
        canEdit={canEdit}
        isAdmin={isAdmin}
        sections={sectionOpts}
        subjects={subjectOpts}
        printHref={`/print/diary?section=${section.id}&date=${date}`}
      />
    </>
  );
}
