import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import type { BellData, EntryLite, Slot } from "./shared";

type Supa = Awaited<ReturnType<typeof createClient>>;

type SchedRow = { id: string; name: string; note: string | null; is_default: boolean };
type PeriodRow = { id: string; schedule_id: string; seq: number; kind: string; period_no: number | null; label: string | null; start_time: string; end_time: string };
type ClassBellRow = { class_id: string; weekday: number; schedule_id: string };

function buildBell(schedules: SchedRow[], periods: PeriodRow[], cls: ClassBellRow[]): BellData {
  const byId: Record<string, Slot[]> = {};
  for (const p of periods) {
    (byId[p.schedule_id] ??= []).push({
      id: p.id,
      seq: p.seq,
      kind: p.kind as Slot["kind"],
      periodNo: p.period_no as Slot["periodNo"],
      label: p.label ?? (p.kind === "teaching" ? `Period ${p.period_no}` : p.kind === "lunch" ? "Lunch" : "Break"),
      start: p.start_time,
      end: p.end_time,
    });
  }
  for (const k of Object.keys(byId)) byId[k].sort((a, b) => a.start.localeCompare(b.start));
  const sch = schedules.map((s) => ({ id: s.id, name: s.name, note: s.note, isDefault: s.is_default }));
  return {
    schedules: sch,
    periods: byId,
    classSchedule: Object.fromEntries(cls.map((c) => [`${c.class_id}|${c.weekday}`, c.schedule_id])),
    defaultId: sch.find((s) => s.isDefault)?.id ?? null,
  };
}

export async function getBellData(supabase: Supa): Promise<BellData> {
  const [{ data: schedules }, { data: periods }, { data: cls }] = await Promise.all([
    supabase.from("bell_schedules").select("id, name, note, is_default").order("name"),
    supabase.from("bell_periods").select("id, schedule_id, seq, kind, period_no, label, start_time, end_time").order("seq"),
    supabase.from("class_bell_schedules").select("class_id, weekday, schedule_id"),
  ]);
  return buildBell(schedules ?? [], (periods ?? []) as PeriodRow[], cls ?? []);
}

/** Everything the class timetable page needs, from ONE database call (timetable_page). */
export async function getTimetablePage(supabase: Supa, yearId: string) {
  const { data, error } = await supabase.rpc("timetable_page", { p_year: yearId });
  if (error) throw error;
  const j = data as unknown as {
    schedules: SchedRow[]; periods: PeriodRow[]; classBells: ClassBellRow[];
    sections: { id: string; classId: string; className: string; classOrder: number; name: string; label: string; classTeacherId: string | null }[];
    entries: { id: string; section_id: string; weekday: number; period_no: number; subject_id: string | null; activity: string | null; teacher_id: string | null; room: string | null }[];
    assignments: { id: string; section_id: string; subject_id: string; staff_id: string; periods_per_week: number | null }[];
    teachers: Teacher[]; subjects: Record<string, string>; workingDays: number[] | null;
  };
  return {
    bell: buildBell(j.schedules, j.periods, j.classBells),
    sections: j.sections as SectionInfo[],
    entries: j.entries.map((r) => ({ id: r.id, sectionId: r.section_id, weekday: r.weekday, periodNo: r.period_no, subjectId: r.subject_id, activity: r.activity, teacherId: r.teacher_id, room: r.room })) as EntryLite[],
    assignments: j.assignments.map((a) => ({ id: a.id, sectionId: a.section_id, subjectId: a.subject_id, staffId: a.staff_id, target: a.periods_per_week })) as AssignmentLite[],
    teachers: j.teachers,
    subjects: j.subjects,
    working: j.workingDays ?? [1, 2, 3, 4, 5, 6],
  };
}

export type SectionInfo = { id: string; classId: string; className: string; classOrder: number; name: string; label: string; classTeacherId: string | null };

export async function getSectionsInfo(supabase: Supa, yearId: string): Promise<SectionInfo[]> {
  const [{ data: sections }, { data: classes }] = await Promise.all([
    supabase.from("sections").select("id, name, class_id, class_teacher_id").eq("academic_year_id", yearId),
    supabase.from("classes").select("id, name, sort_order"),
  ]);
  const c = new Map((classes ?? []).map((x) => [x.id, x]));
  return (sections ?? [])
    .map((s) => ({
      id: s.id,
      classId: s.class_id,
      className: c.get(s.class_id)?.name ?? "—",
      classOrder: c.get(s.class_id)?.sort_order ?? 0,
      name: s.name,
      label: `${c.get(s.class_id)?.name ?? "—"} – ${s.name}`,
      classTeacherId: s.class_teacher_id,
    }))
    .sort((a, b) => a.classOrder - b.classOrder || a.name.localeCompare(b.name));
}

export async function getEntries(supabase: Supa, yearId: string): Promise<EntryLite[]> {
  const rows = await fetchAll((f, t) =>
    supabase
      .from("timetable_entries")
      .select("id, section_id, weekday, period_no, subject_id, activity, teacher_id, room")
      .eq("academic_year_id", yearId)
      .range(f, t),
  );
  return rows.map((r) => ({
    id: r.id,
    sectionId: r.section_id,
    weekday: r.weekday,
    periodNo: r.period_no,
    subjectId: r.subject_id,
    activity: r.activity,
    teacherId: r.teacher_id,
    room: r.room,
  }));
}

export type Teacher = { id: string; name: string };

/** Everyone the editor may pick as a teacher (staff directory is open to editors). */
export async function getTeachers(supabase: Supa): Promise<Teacher[]> {
  const { data } = await supabase.rpc("staff_directory");
  return (data ?? []).filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.full_name }));
}

export async function getSubjectNames(supabase: Supa): Promise<Record<string, string>> {
  const { data } = await supabase.from("subjects").select("id, name");
  return Object.fromEntries((data ?? []).map((s) => [s.id, s.name]));
}

export type AssignmentLite = { id: string; sectionId: string; subjectId: string; staffId: string; target: number | null };
export async function getAssignments(supabase: Supa): Promise<AssignmentLite[]> {
  const rows = await fetchAll((f, t) => supabase.from("teacher_assignments").select("id, section_id, subject_id, staff_id, periods_per_week").range(f, t));
  return rows.map((a) => ({ id: a.id, sectionId: a.section_id, subjectId: a.subject_id, staffId: a.staff_id, target: a.periods_per_week }));
}

export async function getWorkingDays(supabase: Supa): Promise<number[]> {
  const { data } = await supabase.from("school_settings").select("working_days").eq("id", 1).maybeSingle();
  return (data?.working_days as number[] | undefined) ?? [1, 2, 3, 4, 5, 6];
}
