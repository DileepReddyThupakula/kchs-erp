import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CurrentStaff } from "@/lib/auth/session";
import { studentCountsBySection } from "@/features/students/queries";

export type MyClassRow = {
  sectionId: string;
  className: string;
  classOrder: number;
  section: string;
  medium: string | null;
  isClassTeacher: boolean;
  subjects: string[];
  students: number | null;
};

/**
 * The teacher's own sections for a year: class teacher of it, or assigned to
 * teach any subject in it. Filtered explicitly by staff id, so a duty that
 * widens what RLS returns never widens "My classes".
 */
export async function getMyClasses(me: CurrentStaff, yearId: string): Promise<MyClassRow[]> {
  const supabase = await createClient();
  const { data: mine } = await supabase.from("teacher_assignments").select("section_id, subject_id").eq("staff_id", me.staffId);
  const assignedIds = [...new Set((mine ?? []).map((a) => a.section_id))];

  let q = supabase.from("sections").select("id, name, medium, class_id, class_teacher_id").eq("academic_year_id", yearId);
  q = assignedIds.length ? q.or(`class_teacher_id.eq.${me.staffId},id.in.(${assignedIds.join(",")})`) : q.eq("class_teacher_id", me.staffId);
  const { data: sections } = await q;
  if (!sections?.length) return [];

  const subjectIds = [...new Set((mine ?? []).map((a) => a.subject_id))];
  const [counts, { data: classes }, { data: subjects }] = await Promise.all([
    studentCountsBySection(supabase, yearId),
    supabase.from("classes").select("id, name, sort_order").in("id", [...new Set(sections.map((s) => s.class_id))]),
    subjectIds.length ? supabase.from("subjects").select("id, name, sort_order").in("id", subjectIds) : Promise.resolve({ data: [] }),
  ]);
  const cls = new Map((classes ?? []).map((c) => [c.id, c]));
  const sub = new Map((subjects ?? []).map((s) => [s.id, s]));

  return sections
    .map((s) => ({
      sectionId: s.id,
      className: cls.get(s.class_id)?.name ?? "—",
      classOrder: cls.get(s.class_id)?.sort_order ?? 0,
      section: s.name,
      medium: s.medium,
      isClassTeacher: s.class_teacher_id === me.staffId,
      subjects: (mine ?? [])
        .filter((a) => a.section_id === s.id)
        .map((a) => sub.get(a.subject_id))
        .filter((x): x is { id: string; name: string; sort_order: number } => !!x)
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((x) => x.name),
      students: counts.get(s.id) ?? 0,
    }))
    .sort((a, b) => a.classOrder - b.classOrder || a.section.localeCompare(b.section));
}
