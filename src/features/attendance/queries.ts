import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";

type Supa = Awaited<ReturnType<typeof createClient>>;

export type RosterStudent = { studentId: string; admissionNo: string; name: string; roll: number | null };

/**
 * Students to mark in a section. Uses the roster function (works for a
 * substitute marker); falls back to the scope-checked students tables
 * until that function is installed.
 */
export async function getRoster(supabase: Supa, sectionId: string, date: string, yearId: string): Promise<RosterStudent[]> {
  const { data, error } = await supabase.rpc("attendance_roster", { p_section: sectionId, p_date: date });
  if (!error) return (data ?? []).map((r) => ({ studentId: r.student_id, admissionNo: r.admission_no, name: r.full_name, roll: r.roll_no }));
  if (error.code !== "PGRST202" && error.code !== "42883") return [];
  const { data: en } = await supabase.from("student_enrollments").select("student_id, roll_no").eq("section_id", sectionId).eq("academic_year_id", yearId).eq("status", "active");
  const ids = (en ?? []).map((e) => e.student_id);
  if (!ids.length) return [];
  const { data: st } = await supabase.from("students").select("id, admission_no, full_name, admission_date, status").in("id", ids).eq("status", "active");
  const roll = new Map((en ?? []).map((e) => [e.student_id, e.roll_no]));
  return (st ?? [])
    .filter((s) => s.admission_date <= date)
    .map((s) => ({ studentId: s.id, admissionNo: s.admission_no, name: s.full_name, roll: roll.get(s.id) ?? null }))
    .sort((a, b) => (a.roll ?? 9999) - (b.roll ?? 9999) || a.name.localeCompare(b.name));
}

export type SavedSession = {
  id: string;
  markedBy: string | null;
  markedByName: string | null;
  markedAt: string;
  kind: string;
  rows: Record<string, { status: string; note: string | null }>;
} | null;

export async function getSavedSession(supabase: Supa, sectionId: string, date: string, session: string): Promise<SavedSession> {
  const { data: s } = await supabase
    .from("attendance_sessions")
    .select("id, marked_by, marked_at, kind")
    .eq("section_id", sectionId)
    .eq("att_date", date)
    .eq("session", session as "morning" | "afternoon")
    .maybeSingle();
  if (!s) return null;
  const { data: rows } = await supabase.from("student_attendance").select("student_id, status, note").eq("session_id", s.id);
  let name: string | null = null;
  if (s.marked_by) {
    const { data: dir } = await supabase.rpc("staff_directory");
    name = (dir ?? []).find((d) => d.id === s.marked_by)?.full_name ?? null;
  }
  return {
    id: s.id,
    markedBy: s.marked_by,
    markedByName: name,
    markedAt: s.marked_at,
    kind: s.kind,
    rows: Object.fromEntries((rows ?? []).map((r) => [r.student_id, { status: r.status, note: r.note }])),
  };
}

export type DailyRow = { studentId: string; date: string; morning: string | null; afternoon: string | null; day: string };
export async function getDailyRows(supabase: Supa, studentIds: string[], from: string, to: string): Promise<DailyRow[]> {
  if (!studentIds.length) return [];
  const rows = await fetchAll((f, t) =>
    supabase.from("attendance_daily").select("student_id, att_date, morning, afternoon, day_status").in("student_id", studentIds).gte("att_date", from).lte("att_date", to).range(f, t),
  );
  return rows.map((r) => ({ studentId: r.student_id, date: r.att_date, morning: r.morning, afternoon: r.afternoon, day: r.day_status }));
}

export async function getLowThreshold(supabase: Supa): Promise<number> {
  const { data } = await supabase.from("school_settings").select("low_attendance_pct").eq("id", 1).maybeSingle();
  return data?.low_attendance_pct ?? 75;
}
