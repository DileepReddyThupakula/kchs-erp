"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability, requireStaff } from "@/lib/auth/session";
import { friendlyDbError } from "@/lib/utils";

const uuid = z.string().uuid();
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type AtResult = { ok: true; message?: string; counts?: { present: number; absent: number; late: number } } | { ok: false; error: string };
const fail = (error: string): AtResult => ({ ok: false, error });

function msg(err: { code?: string; message: string }): string {
  if (err.code === "42501") {
    if (/only for today/.test(err.message)) return "This day is locked. Only the Admin or a teacher with the attendance duty can change a past day.";
    if (/not assigned to you/.test(err.message)) return "This session is assigned to another teacher today.";
    return "You don't have permission to do this.";
  }
  return friendlyDbError(err);
}
function refresh() {
  revalidatePath("/attendance", "layout");
  revalidatePath("/staff", "layout");
  revalidatePath("/my/leave");
  revalidatePath("/dashboard");
}

const entrySchema = z.object({ studentId: uuid, status: z.enum(["present", "absent", "late"]), note: z.string().max(200).optional() });

export async function saveAttendance(input: { sectionId: string; date: string; session: "morning" | "afternoon"; entries: z.infer<typeof entrySchema>[] }): Promise<AtResult> {
  await requireStaff();
  if (!uuid.safeParse(input.sectionId).success || !DATE.test(input.date) || !["morning", "afternoon"].includes(input.session)) return fail("Invalid section, date or session.");
  const e = z.array(entrySchema).safeParse(input.entries);
  if (!e.success || !e.data.length) return fail("Nothing to save.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_attendance", {
    p_section: input.sectionId,
    p_date: input.date,
    p_session: input.session,
    p_entries: e.data.map((r) => ({ student_id: r.studentId, status: r.status, note: r.note ?? null })),
  });
  if (error) return fail(msg(error));
  refresh();
  const c = { present: 0, absent: 0, late: 0 };
  for (const r of e.data) c[r.status]++;
  return { ok: true, message: "Attendance saved.", counts: c };
}

// ------------------------------------------------------------------ leave
export async function applyLeave(input: { typeId: string; from: string; to: string; reason: string; staffId?: string }): Promise<AtResult> {
  const me = await requireStaff();
  if (!uuid.safeParse(input.typeId).success || !DATE.test(input.from) || !DATE.test(input.to)) return fail("Choose the leave type and both dates.");
  if (input.to < input.from) return fail("The last day can't be before the first day.");
  if (input.reason.trim().length < 3) return fail("Please give a short reason.");
  const staffId = me.role === "admin" && input.staffId && uuid.safeParse(input.staffId).success ? input.staffId : me.staffId;
  const supabase = await createClient();
  const { error } = await supabase
    .from("leave_requests")
    .insert({ staff_id: staffId, leave_type_id: input.typeId, from_date: input.from, to_date: input.to, reason: input.reason.trim() });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: "Leave request sent." };
}

export async function cancelLeave(id: string): Promise<AtResult> {
  await requireStaff();
  if (!uuid.safeParse(id).success) return fail("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_leave", { p_id: id });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: "Request cancelled." };
}

export async function decideLeave(id: string, approve: boolean, note: string): Promise<AtResult> {
  await requireCapability("leave.approve");
  if (!uuid.safeParse(id).success) return fail("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("decide_leave", { p_id: id, p_approve: approve, p_note: note.trim() || undefined });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: approve ? "Leave approved." : "Leave rejected." };
}

export async function setLeaveAllowance(input: { staffId: string; typeId: string; yearId: string; days: number | null }): Promise<AtResult> {
  await requireCapability("leave.approve");
  if (![input.staffId, input.typeId, input.yearId].every((x) => uuid.safeParse(x).success)) return fail("Invalid selection.");
  if (input.days !== null && (!Number.isFinite(input.days) || input.days < 0 || input.days > 365)) return fail("Enter days between 0 and 365, or leave empty for unlimited.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("leave_balances")
    .upsert({ staff_id: input.staffId, leave_type_id: input.typeId, academic_year_id: input.yearId, allowance_days: input.days }, { onConflict: "staff_id,leave_type_id,academic_year_id" });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: "Allowance saved." };
}

export async function saveLeaveType(input: { id?: string; name: string; defaultDays: number | null; active: boolean }): Promise<AtResult> {
  await requireCapability("leave.approve");
  if (input.name.trim().length < 2) return fail("Give the leave type a name.");
  if (input.defaultDays !== null && (!Number.isFinite(input.defaultDays) || input.defaultDays < 0)) return fail("Days must be 0 or more, or empty for unlimited.");
  const supabase = await createClient();
  const row = { name: input.name.trim(), default_days: input.defaultDays, is_active: input.active };
  const { error } = input.id ? await supabase.from("leave_types").update(row).eq("id", input.id) : await supabase.from("leave_types").insert(row);
  if (error) return fail(error.code === "23505" ? "A leave type with this name already exists." : msg(error));
  refresh();
  return { ok: true, message: "Leave type saved." };
}

// ------------------------------------------------------------------ staff attendance + threshold
export async function saveStaffAttendance(date: string, rows: { staffId: string; status: "present" | "absent" | "late" | "on_leave"; note?: string }[]): Promise<AtResult> {
  await requireCapability("leave.approve"); // Admin only
  if (!DATE.test(date) || !rows.length) return fail("Choose a date and mark at least one person.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_staff_attendance", { p_date: date, p_rows: rows.map((r) => ({ staff_id: r.staffId, status: r.status, note: r.note ?? null })) });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: `Staff attendance saved for ${rows.length} people.` };
}

export async function saveLowAttendanceThreshold(pct: number): Promise<AtResult> {
  await requireCapability("settings.edit");
  if (!Number.isInteger(pct) || pct < 1 || pct > 100) return fail("Enter a whole number between 1 and 100.");
  const supabase = await createClient();
  const { error } = await supabase.from("school_settings").update({ low_attendance_pct: pct }).eq("id", 1);
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: "Threshold saved." };
}
