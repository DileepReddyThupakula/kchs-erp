import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CurrentStaff } from "@/lib/auth/session";
import { getSectionsInfo } from "@/features/timetable/queries";
import { can } from "@/lib/auth/permissions";
import type { CompLite, GroupLite, MemberLite, Mode } from "./shared";

type Supa = Awaited<ReturnType<typeof createClient>>;
export type SectionOpt = Awaited<ReturnType<typeof getSectionsInfo>>[number];

/** Sections this person may open in the exam pages: everything for Admin and the marks duty, else the sections where they have an assignment or are class teacher. */
export async function getExamSections(supabase: Supa, me: CurrentStaff, yearId: string): Promise<SectionOpt[]> {
  return getSectionsInfo(supabase, yearId); // RLS already limits teachers to their own sections
}

export type SchemeData = {
  mode: Mode;
  components: (CompLite & { sort_order: number; locked_at: string | null; lock_note: string | null })[];
  groups: (GroupLite & { start_date: string | null; end_date: string | null; sort_order: number; locked_at: string | null })[];
  members: MemberLite[];
  subjectMax: { component_id: string; subject_id: string; max_marks: number }[];
  passMarks: Map<string, number>;
};

export async function getScheme(supabase: Supa, yearId: string, classId: string): Promise<SchemeData> {
  // one round trip: the members are fetched through their group (inner join) instead of after it
  const [{ data: comps }, { data: groups }, { data: modes }, { data: over }, { data: pm }, { data: members }, { data: cls }] = await Promise.all([
    supabase.from("exam_components").select("id, name, max_marks, sort_order, locked_at, lock_note").eq("academic_year_id", yearId).eq("class_id", classId).order("sort_order"),
    supabase.from("result_groups").select("id, name, kind, method, best_n, scale_to, start_date, end_date, sort_order, locked_at").eq("academic_year_id", yearId).eq("class_id", classId).order("sort_order"),
    supabase.from("exam_class_modes").select("mode").eq("academic_year_id", yearId).eq("class_id", classId),
    supabase.from("exam_subject_max").select("component_id, subject_id, max_marks, exam_components!inner(class_id, academic_year_id)").eq("exam_components.class_id", classId).eq("exam_components.academic_year_id", yearId),
    supabase.from("subject_pass_marks").select("subject_id, pass_percent").eq("academic_year_id", yearId).eq("class_id", classId),
    supabase.from("result_group_members").select("id, group_id, component_id, child_group_id, scale_to, sort_order, result_groups!group_id!inner(class_id, academic_year_id)").eq("result_groups.class_id", classId).eq("result_groups.academic_year_id", yearId),
    supabase.from("classes").select("name").eq("id", classId).maybeSingle(),
  ]);
  const defaultMode: Mode = cls && ["nursery", "lkg", "ukg"].includes(cls.name.toLowerCase()) ? "grades" : "marks";
  return {
    mode: ((modes ?? [])[0]?.mode as Mode | undefined) ?? defaultMode,
    components: (comps ?? []).map((c) => ({ ...c, max_marks: Number(c.max_marks) })),
    groups: groups ?? [],
    members: (members ?? []).map((m) => ({ id: m.id, group_id: m.group_id, component_id: m.component_id, child_group_id: m.child_group_id, sort_order: m.sort_order, scale_to: m.scale_to == null ? null : Number(m.scale_to) })),
    subjectMax: (over ?? []).map((o) => ({ component_id: o.component_id, subject_id: o.subject_id, max_marks: Number(o.max_marks) })),
    passMarks: new Map((pm ?? []).map((p) => [p.subject_id, Number(p.pass_percent)])),
  };
}

export type ClassSubject = { id: string; name: string; type: string; sort_order: number };
export async function getClassSubjects(supabase: Supa, yearId: string, classId: string): Promise<ClassSubject[]> {
  const [{ data: cs }, names, { data: subs }] = await Promise.all([
    supabase.from("class_subjects").select("subject_id, sort_order").eq("academic_year_id", yearId).eq("class_id", classId).order("sort_order"),
    supabase.rpc("subject_names"),
    supabase.from("subjects").select("id, type"),
  ]);
  const type = new Map((subs ?? []).map((s) => [s.id, s.type]));
  const nm = new Map((names.data ?? []).map((s) => [s.id, s.name]));
  return (cs ?? []).map((c) => ({ id: c.subject_id, name: nm.get(c.subject_id) ?? "Subject", type: type.get(c.subject_id) ?? "scholastic", sort_order: c.sort_order }));
}

export async function getMyPairs(supabase: Supa, me: CurrentStaff): Promise<{ section_id: string; subject_id: string }[]> {
  const { data } = await supabase.from("teacher_assignments").select("section_id, subject_id").eq("staff_id", me.staffId);
  return data ?? [];
}

export const canSeeAll = (me: CurrentStaff) => can(me, "marks.enterAll");

/** The section asked for, else the first one whose class already has an exam scheme (so a default page is never empty). */
export async function pickSection(supabase: Supa, sections: SectionOpt[], yearId: string, wanted?: string): Promise<SectionOpt> {
  const asked = sections.find((s) => s.id === wanted);
  if (asked) return asked;
  const { data } = await supabase.from("result_groups").select("class_id").eq("academic_year_id", yearId);
  const withScheme = new Set((data ?? []).map((g) => g.class_id));
  return sections.find((s) => withScheme.has(s.classId)) ?? sections[0];
}


// ------------------------------------------------------------------ one-call pages (public.marks_page / public.results_page)
type SchemeJson = {
  mode: Mode;
  components: { id: string; name: string; max_marks: number | string; sort_order: number; locked_at: string | null; lock_note: string | null }[];
  groups: SchemeData["groups"];
  members: { id: string; group_id: string; component_id: string | null; child_group_id: string | null; scale_to: number | string | null; sort_order: number }[];
  subjectMax: { component_id: string; subject_id: string; max_marks: number | string }[];
  passMarks: Record<string, number | string>;
  subjects: ClassSubject[];
};
/** The scheme as the pages use it, from the JSON the page functions return. */
export function schemeFromJson(j: SchemeJson): SchemeData & { subjects: ClassSubject[] } {
  return {
    mode: j.mode,
    components: j.components.map((c) => ({ ...c, max_marks: Number(c.max_marks) })),
    groups: j.groups,
    members: j.members.map((m) => ({ id: m.id, group_id: m.group_id, component_id: m.component_id, child_group_id: m.child_group_id, sort_order: m.sort_order, scale_to: m.scale_to == null ? null : Number(m.scale_to) })),
    subjectMax: j.subjectMax.map((o) => ({ component_id: o.component_id, subject_id: o.subject_id, max_marks: Number(o.max_marks) })),
    passMarks: new Map(Object.entries(j.passMarks).map(([k, v]) => [k, Number(v)])),
    subjects: j.subjects,
  };
}
export type PageResult = { student_id: string; group_id: string; subject_id: string; scored: number | string; max_marks: number | string; pct: number | string; grade: string | null; grade_point: number | string | null; pass_percent: number | string; passed: boolean; missing: number; has_absent: boolean; locked: boolean };
export type MarksPage = {
  all: boolean;
  sections: SectionOpt[];
  section?: SectionOpt;
  scheme?: SchemeJson;
  subjects?: ClassSubject[];
  subject_id?: string | null;
  component_id?: string | null;
  students?: { id: string; roll: number | null; name: string; adm: string }[];
  marks?: Record<string, { status: "marked" | "absent" | "na"; marks: number | string | null }>;
  results?: PageResult[];
  pending?: number;
};
export type ResultsPage = {
  all: boolean;
  sections: SectionOpt[];
  section?: SectionOpt;
  scheme?: SchemeJson;
  group_id?: string | null;
  students?: { id: string; roll: number | null; name: string }[];
  results?: PageResult[];
  totals?: { student_id: string; scored: number | string; max_marks: number | string; pct: number | string; grade: string | null; grade_point: number | string | null; result: "pass" | "fail" | "incomplete" }[];
};
