"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/auth/session";

const uuid = z.string().uuid();
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}(:\d{2})?$/;

export type TtResult = { ok: true; message?: string } | { ok: false; error: string };

function fail(error: string): TtResult {
  return { ok: false, error };
}
function refresh() {
  revalidatePath("/timetable", "layout");
  revalidatePath("/my/timetable");
  revalidatePath("/dashboard");
}

/** The database raises readable messages for timetable rules; keep them. */
function msg(err: { code?: string; message: string }): string {
  if (err.code === "42501") return "You don't have permission to do this.";
  if (err.code === "23505") {
    if (/section_id.*weekday.*period_no|timetable_entries_section/.test(err.message)) return "That period already has an entry. Clear it first.";
    if (/duplicate key/.test(err.message)) return "That teacher is already booked in that period.";
    return err.message;
  }
  if (err.code === "23503") {
    if (/teacher_assignments/.test(err.message)) return "That teacher is not assigned to that subject in this section (see Teacher assignments).";
    return "This is still in use elsewhere, so it can't be removed.";
  }
  if (err.code === "23P01") return "Bell times overlap. Each period or break must start after the previous one ends.";
  return err.message;
}

// ------------------------------------------------------------------ class timetable cells
const cellSchema = z.object({
  sectionId: uuid,
  weekday: z.number().int().min(1).max(7),
  periodNo: z.number().int().min(1).max(15),
  mode: z.enum(["subject", "activity", "clear"]),
  subjectId: uuid.nullish(),
  teacherId: uuid.nullish(),
  activity: z.string().trim().min(2).max(40).nullish(),
  room: z.string().trim().max(40).nullish(),
});

export async function saveCell(input: z.infer<typeof cellSchema>): Promise<TtResult> {
  await requireCapability("timetable.edit");
  const p = cellSchema.safeParse(input);
  if (!p.success) return fail("Please choose what happens in this period.");
  const v = p.data;
  const supabase = await createClient();
  const key = { section_id: v.sectionId, weekday: v.weekday, period_no: v.periodNo };
  if (v.mode === "clear") {
    const { error } = await supabase.from("timetable_entries").delete().match(key);
    if (error) return fail(msg(error));
    refresh();
    return { ok: true, message: "Period cleared." };
  }
  if (v.mode === "subject" && (!v.subjectId || !v.teacherId)) return fail("Choose the subject and teacher.");
  if (v.mode === "activity" && !v.activity) return fail("Choose or type the activity.");
  const fields: { subject_id: string | null; teacher_id: string | null; activity: string | null; room: string | null } =
    v.mode === "subject"
      ? { subject_id: v.subjectId!, teacher_id: v.teacherId!, activity: null, room: v.room || null }
      : { subject_id: null, teacher_id: null, activity: v.activity!, room: v.room || null };
  // update the cell if it already has an entry, else create it
  const { data: existing } = await supabase.from("timetable_entries").select("id").match(key).maybeSingle();
  const { error } = existing
    ? await supabase.from("timetable_entries").update(fields).eq("id", existing.id)
    : await supabase.from("timetable_entries").insert({ ...key, ...fields });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: "Saved." };
}

/** Copy one weekday's pattern onto other weekdays (whole day replaced; stops at the first problem). */
export async function copyDay(input: { sectionId: string; from: number; to: number[] }): Promise<TtResult> {
  await requireCapability("timetable.edit");
  if (!uuid.safeParse(input.sectionId).success || !input.to.length || input.to.some((d) => d < 1 || d > 7 || d === input.from)) {
    return fail("Choose a day to copy from and at least one other day.");
  }
  const supabase = await createClient();
  const { data: src, error } = await supabase
    .from("timetable_entries")
    .select("period_no, subject_id, activity, teacher_id, room")
    .eq("section_id", input.sectionId)
    .eq("weekday", input.from);
  if (error) return fail(msg(error));
  if (!src?.length) return fail("That day has no periods to copy.");
  const skipped: string[] = [];
  let copied = 0;
  for (const day of input.to) {
    const { error: delErr } = await supabase.from("timetable_entries").delete().eq("section_id", input.sectionId).eq("weekday", day);
    if (delErr) return fail(msg(delErr));
    for (const e of src) {
      const { error: insErr } = await supabase
        .from("timetable_entries")
        .insert({ section_id: input.sectionId, weekday: day, period_no: e.period_no, subject_id: e.subject_id, activity: e.activity, teacher_id: e.teacher_id, room: e.room });
      if (insErr) skipped.push(`${e.period_no}/${day}`);
      else copied++;
    }
  }
  refresh();
  if (skipped.length) {
    return { ok: true, message: `Copied ${copied} periods. ${skipped.length} could not be copied because the teacher is busy elsewhere; set those by hand.` };
  }
  return { ok: true, message: `Copied ${copied} periods.` };
}

// ------------------------------------------------------------------ substitutions
export async function addSubstitution(input: { date: string; sectionId: string; periodNo: number; substituteId: string; reason?: string }): Promise<TtResult> {
  await requireCapability("timetable.edit");
  if (!DATE.test(input.date) || !uuid.safeParse(input.sectionId).success || !uuid.safeParse(input.substituteId).success) return fail("Choose the date, class, period and substitute.");
  const supabase = await createClient();
  const { error } = await supabase.from("timetable_substitutions").insert({
    sub_date: input.date,
    section_id: input.sectionId,
    period_no: input.periodNo,
    substitute_teacher_id: input.substituteId,
    original_teacher_id: "00000000-0000-0000-0000-000000000000", // replaced by the database from the timetable
    reason: input.reason?.trim() || null,
  });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: "Substitution saved." };
}

export async function removeSubstitution(id: string): Promise<TtResult> {
  await requireCapability("timetable.edit");
  if (!uuid.safeParse(id).success) return fail("Invalid substitution.");
  const supabase = await createClient();
  const { error } = await supabase.from("timetable_substitutions").delete().eq("id", id);
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: "Substitution removed." };
}

/** Teachers who are free in that period (editors only; the database checks too). */
export async function getFreeTeachers(date: string, periodNo: number, excludeId?: string) {
  await requireCapability("timetable.edit");
  if (!DATE.test(date)) return [] as { id: string; name: string; code: string; load: number }[];
  const supabase = await createClient();
  const { data } = await supabase.rpc("free_teachers", { p_date: date, p_period: periodNo, p_exclude: excludeId });
  return (data ?? []).map((t) => ({ id: t.id, name: t.full_name, code: t.employee_code, load: t.periods_that_day }));
}

/** Free teachers for several periods in one round trip: { "period|excludedTeacher": teachers }. */
export async function getFreeTeachersBatch(date: string, items: { periodNo: number; excludeId?: string }[]) {
  await requireCapability("timetable.edit");
  const out: Record<string, { id: string; name: string; code: string; load: number }[]> = {};
  if (!DATE.test(date)) return out;
  const supabase = await createClient();
  await Promise.all(
    items.map(async (it) => {
      const { data } = await supabase.rpc("free_teachers", { p_date: date, p_period: it.periodNo, p_exclude: it.excludeId });
      out[`${it.periodNo}|${it.excludeId ?? ""}`] = (data ?? []).map((t) => ({ id: t.id, name: t.full_name, code: t.employee_code, load: t.periods_that_day }));
    }),
  );
  return out;
}

// ------------------------------------------------------------------ bell schedules
export async function createSchedule(name: string, copyFromId?: string): Promise<TtResult & { id?: string }> {
  await requireCapability("timetable.edit");
  const n = name.trim();
  if (n.length < 2) return fail("Give the schedule a name (at least 2 letters).");
  const supabase = await createClient();
  const { data, error } = await supabase.from("bell_schedules").insert({ name: n }).select("id").single();
  if (error) return fail(error.code === "23505" ? "A schedule with this name already exists." : msg(error));
  if (copyFromId && uuid.safeParse(copyFromId).success) {
    const { data: src } = await supabase.from("bell_periods").select("seq, kind, period_no, label, start_time, end_time").eq("schedule_id", copyFromId);
    if (src?.length) {
      const { error: e2 } = await supabase.from("bell_periods").insert(src.map((p) => ({ ...p, schedule_id: data.id })));
      if (e2) return fail(msg(e2));
    }
  }
  refresh();
  return { ok: true, message: "Schedule created.", id: data.id };
}

export async function updateSchedule(id: string, patch: { name?: string; note?: string; isDefault?: boolean }): Promise<TtResult> {
  await requireCapability("timetable.edit");
  if (!uuid.safeParse(id).success) return fail("Invalid schedule.");
  const upd: { name?: string; note?: string | null; is_default?: boolean } = {};
  if (patch.name !== undefined) {
    if (patch.name.trim().length < 2) return fail("Give the schedule a name (at least 2 letters).");
    upd.name = patch.name.trim();
  }
  if (patch.note !== undefined) upd.note = patch.note.trim() || null;
  if (patch.isDefault) upd.is_default = true;
  const supabase = await createClient();
  const { error } = await supabase.from("bell_schedules").update(upd).eq("id", id);
  if (error) return fail(error.code === "23505" ? "A schedule with this name already exists." : msg(error));
  refresh();
  return { ok: true, message: "Schedule updated." };
}

export async function deleteSchedule(id: string): Promise<TtResult> {
  await requireCapability("timetable.edit");
  if (!uuid.safeParse(id).success) return fail("Invalid schedule.");
  const supabase = await createClient();
  const { error } = await supabase.from("bell_schedules").delete().eq("id", id);
  if (error) {
    if (error.code === "23503") return fail("This schedule is assigned to a class on some weekday. Reassign those first.");
    return fail(msg(error));
  }
  refresh();
  return { ok: true, message: "Schedule deleted." };
}

const periodSchema = z.array(
  z.object({
    id: uuid.nullish(),
    kind: z.enum(["teaching", "break", "lunch"]),
    label: z.string().trim().max(30),
    start: z.string().regex(TIME),
    end: z.string().regex(TIME),
  }),
);

/**
 * Replace a schedule's periods. Rows are listed in time order; teaching
 * periods are numbered 1..n automatically. Removed rows are first turned into
 * breaks in the same statement (so numbering never has a gap), then deleted.
 */
export async function savePeriods(scheduleId: string, rows: z.infer<typeof periodSchema>): Promise<TtResult> {
  await requireCapability("timetable.edit");
  if (!uuid.safeParse(scheduleId).success) return fail("Invalid schedule.");
  const p = periodSchema.safeParse(rows);
  if (!p.success) return fail("Every row needs a start and end time.");
  if (!p.data.length) return fail("A schedule needs at least one period.");
  for (const r of p.data) if (r.end <= r.start) return fail("Each period must end after it starts.");
  const sorted = [...p.data].sort((a, b) => a.start.localeCompare(b.start));
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].start < sorted[i - 1].end) return fail("Bell times overlap. Each period or break must start after the previous one ends.");
  }
  if (!sorted.some((r) => r.kind === "teaching")) return fail("Add at least one teaching period.");

  const supabase = await createClient();
  const { data: existing, error: exErr } = await supabase.from("bell_periods").select("id").eq("schedule_id", scheduleId);
  if (exErr) return fail(msg(exErr));
  const keepIds = new Set(sorted.map((r) => r.id).filter(Boolean) as string[]);
  const removed = (existing ?? []).filter((e) => !keepIds.has(e.id));

  let n = 0;
  const upsertRows = sorted.map((r, i) => ({
    id: r.id ?? crypto.randomUUID(),
    schedule_id: scheduleId,
    seq: i + 1,
    kind: r.kind,
    period_no: r.kind === "teaching" ? ++n : null,
    label: r.label || (r.kind === "teaching" ? `Period ${n}` : r.kind === "lunch" ? "Lunch" : "Break"),
    start_time: r.start,
    end_time: r.end,
  }));
  // removed rows are parked as one-second breaks late in the evening in the same
  // statement (so numbering never has a gap and nothing overlaps), then deleted
  if (upsertRows.length + removed.length > 40 || removed.length > 58) return fail("Too many rows in one save. Save in two steps.");
  const parked = removed.map((e, i) => ({
    id: e.id,
    schedule_id: scheduleId,
    seq: upsertRows.length + 1 + i,
    kind: "break" as const,
    period_no: null,
    label: "removed",
    start_time: `23:58:${String(i).padStart(2, "0")}`,
    end_time: `23:58:${String(i + 1).padStart(2, "0")}`,
  }));
  const { error } = await supabase.from("bell_periods").upsert([...upsertRows, ...parked], { onConflict: "id" });
  if (error) return fail(msg(error));
  if (removed.length) {
    const { error: delErr } = await supabase.from("bell_periods").delete().in("id", removed.map((r) => r.id));
    if (delErr) return fail(msg(delErr));
  }
  refresh();
  return { ok: true, message: "Bell schedule saved." };
}

export async function setClassSchedule(classId: string, weekday: number, scheduleId: string | null): Promise<TtResult> {
  await requireCapability("timetable.edit");
  if (!uuid.safeParse(classId).success || weekday < 1 || weekday > 7) return fail("Invalid class or weekday.");
  const supabase = await createClient();
  if (!scheduleId) {
    const { error } = await supabase.from("class_bell_schedules").delete().match({ class_id: classId, weekday });
    if (error) return fail(msg(error));
  } else {
    if (!uuid.safeParse(scheduleId).success) return fail("Invalid schedule.");
    const { error } = await supabase.from("class_bell_schedules").upsert({ class_id: classId, weekday, schedule_id: scheduleId }, { onConflict: "class_id,weekday" });
    if (error) return fail(msg(error));
  }
  refresh();
  return { ok: true };
}
