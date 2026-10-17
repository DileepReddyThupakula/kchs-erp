"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/auth/session";
import { friendlyDbError, type ActionState } from "@/lib/utils";

const blankToNull = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();
const optionalInt = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().int().positive().nullable())
  .optional();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick a date");
const uuid = z.string().uuid();

function invalid(e: z.ZodError): ActionState {
  return { fieldErrors: e.flatten().fieldErrors, error: "Please fix the highlighted fields." };
}

async function done(path: string, message: string): Promise<ActionState> {
  revalidatePath(path, "layout");
  return { ok: true, message };
}

// ---------------------------------------------------------------- academic years
const yearSchema = z
  .object({
    name: z.string().trim().min(4, "e.g. 2026-27"),
    start_date: date,
    end_date: date,
    status: z.enum(["planned", "active", "closed"]).default("planned"),
  })
  .refine((v) => v.end_date > v.start_date, { path: ["end_date"], message: "End must be after start" });

export async function saveAcademicYear(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("setup.edit");
  const parsed = yearSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return invalid(parsed.error);
  const id = fd.get("id")?.toString();
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("academic_years").update(parsed.data).eq("id", id)
    : await supabase.from("academic_years").insert(parsed.data);
  if (error) return { error: friendlyDbError(error) };
  return done("/setup", id ? "Academic year updated." : "Academic year created. 2nd Saturdays were added as holidays.");
}

export async function setCurrentYear(fd: FormData) {
  await requireCapability("setup.edit");
  const id = uuid.parse(fd.get("id"));
  const supabase = await createClient();
  // Only one year may be current (unique index) — clear first, then set.
  const cleared = await supabase.from("academic_years").update({ is_current: false }).eq("is_current", true);
  if (cleared.error) throw new Error(friendlyDbError(cleared.error));
  const { error } = await supabase.from("academic_years").update({ is_current: true, status: "active" }).eq("id", id);
  if (error) throw new Error(friendlyDbError(error));
  revalidatePath("/", "layout");
}

export async function deleteAcademicYear(fd: FormData): Promise<void> {
  await requireCapability("setup.edit");
  const supabase = await createClient();
  const { error } = await supabase.from("academic_years").delete().eq("id", uuid.parse(fd.get("id")));
  if (error) throw new Error(friendlyDbError(error));
  revalidatePath("/setup", "layout");
}

// ---------------------------------------------------------------- holidays
const holidaySchema = z.object({ academic_year_id: uuid, date, name: z.string().trim().min(2, "Name the holiday") });

export async function addHoliday(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("setup.edit");
  const parsed = holidaySchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { data: year } = await supabase
    .from("academic_years")
    .select("start_date, end_date")
    .eq("id", parsed.data.academic_year_id)
    .single();
  if (year && (parsed.data.date < year.start_date || parsed.data.date > year.end_date)) {
    return { fieldErrors: { date: ["Date is outside this academic year"] } };
  }
  const { error } = await supabase.from("holidays").insert({ ...parsed.data, kind: "declared" });
  if (error) return { error: error.code === "23505" ? "There is already a holiday on that date." : friendlyDbError(error) };
  return done("/setup/academic-years", "Holiday added.");
}

export async function deleteHoliday(fd: FormData): Promise<void> {
  await requireCapability("setup.edit");
  const supabase = await createClient();
  const { error } = await supabase.from("holidays").delete().eq("id", uuid.parse(fd.get("id")));
  if (error) throw new Error(friendlyDbError(error));
  revalidatePath("/setup/academic-years", "layout");
}

export async function regenerateSecondSaturdays(fd: FormData): Promise<void> {
  await requireCapability("setup.edit");
  const supabase = await createClient();
  const { error } = await supabase.rpc("generate_second_saturdays", { p_year_id: uuid.parse(fd.get("id")) });
  if (error) throw new Error(friendlyDbError(error));
  revalidatePath("/setup/academic-years", "layout");
}

// ---------------------------------------------------------------- classes
const classSchema = z.object({
  name: z.string().trim().min(1, "Class name is required"),
  short_name: blankToNull,
  sort_order: z.coerce.number().int().default(0),
  is_active: z.boolean(),
});

export async function saveClass(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("setup.edit");
  const parsed = classSchema.safeParse({ ...Object.fromEntries(fd), is_active: fd.get("is_active") !== "off" });
  if (!parsed.success) return invalid(parsed.error);
  const id = fd.get("id")?.toString();
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("classes").update(parsed.data).eq("id", id)
    : await supabase.from("classes").insert(parsed.data);
  if (error) return { error: friendlyDbError(error) };
  return done("/setup/classes", id ? "Class updated." : "Class added.");
}

export async function deleteClass(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("setup.edit");
  const supabase = await createClient();
  const { error } = await supabase.from("classes").delete().eq("id", uuid.parse(fd.get("id")));
  if (error) return { error: error.code === "23503" ? "This class has sections. Delete them first, or mark the class inactive." : friendlyDbError(error) };
  return done("/setup/classes", "Class deleted.");
}

// ---------------------------------------------------------------- sections
const sectionSchema = z.object({
  academic_year_id: uuid,
  class_id: uuid,
  name: z.string().trim().min(1, "Section name is required"),
  medium: blankToNull,
  room: blankToNull,
  capacity: optionalInt,
  class_teacher_id: blankToNull,
});

export async function saveSection(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("setup.edit");
  const parsed = sectionSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return invalid(parsed.error);
  const id = fd.get("id")?.toString();
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("sections").update(parsed.data).eq("id", id)
    : await supabase.from("sections").insert(parsed.data);
  if (error) return { error: error.code === "23505" ? "This class already has a section with that name." : friendlyDbError(error) };
  return done("/setup/classes", id ? "Section updated." : "Section added.");
}

export async function deleteSection(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("setup.edit");
  const supabase = await createClient();
  const { error } = await supabase.from("sections").delete().eq("id", uuid.parse(fd.get("id")));
  if (error) return { error: friendlyDbError(error) };
  return done("/setup/classes", "Section deleted.");
}

// ---------------------------------------------------------------- subjects
const subjectSchema = z.object({
  name: z.string().trim().min(2, "Subject name is required"),
  code: blankToNull,
  name_te: blankToNull,
  name_te_verified: z.boolean(),
  type: z.enum(["scholastic", "co_scholastic"]),
  sort_order: z.coerce.number().int().default(0),
  is_active: z.boolean(),
});

export async function saveSubject(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("setup.edit");
  const parsed = subjectSchema.safeParse({ ...Object.fromEntries(fd), is_active: fd.get("is_active") !== "off", name_te_verified: fd.get("name_te_verified") === "on" });
  if (!parsed.success) return invalid(parsed.error);
  const id = fd.get("id")?.toString();
  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("subjects").update(parsed.data).eq("id", id)
    : await supabase.from("subjects").insert(parsed.data);
  if (error) return { error: friendlyDbError(error) };
  return done("/setup/subjects", id ? "Subject updated." : "Subject added.");
}

export async function deleteSubject(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("setup.edit");
  const supabase = await createClient();
  const { error } = await supabase.from("subjects").delete().eq("id", uuid.parse(fd.get("id")));
  if (error) return { error: error.code === "23503" ? "This subject is linked to classes or teachers. Mark it inactive instead." : friendlyDbError(error) };
  return done("/setup/subjects", "Subject deleted.");
}

/** Replace the set of subjects a class studies in a year with the ticked ones. */
export async function saveClassSubjects(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("setup.edit");
  const academic_year_id = uuid.parse(fd.get("academic_year_id"));
  const class_id = uuid.parse(fd.get("class_id"));
  const chosen = new Set(fd.getAll("subject_id").map(String));
  const optional = new Set(fd.getAll("optional").map(String));

  const supabase = await createClient();
  const { data: existing, error: readErr } = await supabase
    .from("class_subjects")
    .select("id, subject_id, is_optional")
    .eq("academic_year_id", academic_year_id)
    .eq("class_id", class_id);
  if (readErr) return { error: friendlyDbError(readErr) };

  const toDelete = (existing ?? []).filter((r) => !chosen.has(r.subject_id)).map((r) => r.id);
  if (toDelete.length) {
    const { error } = await supabase.from("class_subjects").delete().in("id", toDelete);
    if (error) return { error: friendlyDbError(error) };
  }
  const rows = [...chosen].map((subject_id, i) => ({
    academic_year_id,
    class_id,
    subject_id,
    is_optional: optional.has(subject_id),
    sort_order: i,
  }));
  if (rows.length) {
    const { error } = await supabase
      .from("class_subjects")
      .upsert(rows, { onConflict: "academic_year_id,class_id,subject_id" });
    if (error) return { error: friendlyDbError(error) };
  }
  return done("/setup/subjects", "Subjects for this class saved.");
}

// ---------------------------------------------------------------- teacher assignments
const assignmentSchema = z.object({
  section_id: uuid,
  subject_id: z.string().uuid("Pick a subject"),
  staff_id: z.string().uuid("Pick a teacher"),
  periods_per_week: optionalInt,
});

export async function addAssignment(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("assignments.edit");
  const parsed = assignmentSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return invalid(parsed.error);
  const supabase = await createClient();
  const { error } = await supabase.from("teacher_assignments").insert(parsed.data);
  if (error) return { error: error.code === "23505" ? "This teacher already teaches that subject in this section." : friendlyDbError(error) };
  return done("/setup/assignments", "Teacher assigned.");
}

export async function deleteAssignment(fd: FormData): Promise<void> {
  await requireCapability("assignments.edit");
  const supabase = await createClient();
  const { error } = await supabase.from("teacher_assignments").delete().eq("id", uuid.parse(fd.get("id")));
  if (error) throw new Error(friendlyDbError(error));
  revalidatePath("/setup/assignments", "layout");
}

// ---------------------------------------------------------------- bulk
/** Set the medium of several sections at once (Admin). */
export async function setSectionsMedium(ids: string[], medium: string | null): Promise<ActionState> {
  await requireCapability("setup.edit");
  const parsed = z.array(uuid).min(1).safeParse(ids);
  if (!parsed.success) return { error: "Pick at least one section." };
  const supabase = await createClient();
  const { error } = await supabase.from("sections").update({ medium }).in("id", parsed.data);
  if (error) return { error: friendlyDbError(error) };
  return done("/setup/classes", `Medium updated for ${parsed.data.length} section(s).`);
}

/** Remove several teacher assignments at once (Admin). */
export async function deleteAssignments(ids: string[]): Promise<ActionState> {
  await requireCapability("assignments.edit");
  const parsed = z.array(uuid).min(1).safeParse(ids);
  if (!parsed.success) return { error: "Pick at least one assignment." };
  const supabase = await createClient();
  const { error, count } = await supabase.from("teacher_assignments").delete({ count: "exact" }).in("id", parsed.data);
  if (error) return { error: friendlyDbError(error) };
  return done("/setup/assignments", `Removed ${count ?? parsed.data.length} assignment(s).`);
}

/** Change the teacher or periods of an existing assignment (Admin). */
export async function updateAssignment(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("assignments.edit");
  const parsed = z
    .object({ id: uuid, staff_id: z.string().uuid("Pick a teacher"), periods_per_week: optionalInt })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return invalid(parsed.error);
  const { id, ...patch } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from("teacher_assignments").update(patch).eq("id", id);
  if (error) return { error: error.code === "23505" ? "That teacher already teaches this subject in this section." : friendlyDbError(error) };
  return done("/setup/assignments", "Assignment updated.");
}
