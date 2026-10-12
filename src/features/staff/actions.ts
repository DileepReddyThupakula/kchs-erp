"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCapability } from "@/lib/auth/session";
import { ASSIGNABLE_ROLES, DUTIES, type Duty } from "@/lib/auth/permissions";
import { friendlyDbError, type ActionState } from "@/lib/utils";

const opt = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable()
  .optional();

const staffSchema = z.object({
  employee_code: z.string().trim().min(1, "Employee code is required"),
  full_name: z.string().trim().min(2, "Name is required"),
  gender: z
    .enum(["", "male", "female", "other"])
    .transform((v) => (v === "" ? null : v))
    .optional(),
  dob: opt,
  phone: opt.refine((v) => !v || /^[6-9]\d{9}$/.test(v), "Enter a 10-digit mobile number"),
  email: opt.refine((v) => !v || z.string().email().safeParse(v).success, "Enter a valid email"),
  designation: opt,
  department: opt,
  qualification: opt,
  date_of_joining: opt,
  address: opt,
  status: z.enum(["active", "inactive", "left"]).default("active"),
});

export async function saveStaff(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("staff.edit");
  const parsed = staffSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, error: "Please fix the highlighted fields." };
  const id = fd.get("id")?.toString();
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("staff").update(parsed.data).eq("id", id);
    if (error) return { error: error.code === "23505" ? "Another staff member has this employee code." : friendlyDbError(error) };
    revalidatePath("/staff", "layout");
    return { ok: true, message: "Saved." };
  }
  const { data, error } = await supabase.from("staff").insert(parsed.data).select("id").single();
  if (error) return { error: error.code === "23505" ? "Another staff member has this employee code." : friendlyDbError(error) };
  revalidatePath("/staff", "layout");
  redirect(`/staff/${data.id}`);
}

// ---------------------------------------------------------------- logins
// Computer Staff is not assignable (the database refuses it too).
const roleSchema = z.enum(ASSIGNABLE_ROLES);
const passwordSchema = z.string().min(8, "At least 8 characters");

/** Create an Auth login for a staff member and give it a role. Admin only. */
export async function createLogin(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("users.manage");
  const parsed = z
    .object({
      staff_id: z.string().uuid(),
      email: z.string().trim().toLowerCase().email("Enter a valid email"),
      password: passwordSchema,
      app_role: roleSchema,
    })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const { staff_id, email, password, app_role } = parsed.data;

  const admin = createAdminClient();
  const { data: created, error: authErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (authErr || !created.user) {
    return { error: authErr?.message.includes("already") ? "A login with this email already exists." : authErr?.message ?? "Could not create login." };
  }

  // Link via the Admin's own session so RLS + audit log record who did it.
  const supabase = await createClient();
  const { error } = await supabase.from("staff").update({ user_id: created.user.id, app_role, email }).eq("id", staff_id);
  if (error) {
    await admin.auth.admin.deleteUser(created.user.id); // roll back the orphan login
    return { error: friendlyDbError(error) };
  }
  await supabase.rpc("log_event", { p_action: "staff.login_created", p_table: "staff", p_record_id: staff_id, p_details: { role: app_role } });
  revalidatePath("/staff", "layout");
  return { ok: true, message: "Login created. Share the password with the staff member in person." };
}

export async function changeRole(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("users.manage");
  const staff_id = z.string().uuid().parse(fd.get("staff_id"));
  const raw = fd.get("app_role")?.toString() ?? "";
  const app_role = raw === "" ? null : roleSchema.parse(raw);
  const supabase = await createClient();
  const { error } = await supabase.from("staff").update({ app_role }).eq("id", staff_id);
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/staff", "layout");
  return { ok: true, message: app_role ? "Role updated." : "Access revoked. The login can no longer open the ERP." };
}

export async function resetPassword(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("users.manage");
  const parsed = z.object({ staff_id: z.string().uuid(), password: passwordSchema }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { data: staff } = await supabase.from("staff").select("user_id").eq("id", parsed.data.staff_id).single();
  if (!staff?.user_id) return { error: "This staff member has no login." };
  const { error } = await createAdminClient().auth.admin.updateUserById(staff.user_id, { password: parsed.data.password });
  if (error) return { error: error.message };
  await supabase.rpc("log_event", { p_action: "staff.password_reset", p_table: "staff", p_record_id: parsed.data.staff_id });
  return { ok: true, message: "Password changed." };
}

// ---------------------------------------------------------------- duties
/**
 * Set a teacher's duties to exactly the ticked ones. Admin only; the database
 * enforces this too and writes every grant/revoke to the audit log.
 */
export async function saveDuties(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("duties.manage");
  const staff_id = z.string().uuid().parse(fd.get("staff_id"));
  const wanted = new Set(
    fd
      .getAll("duty")
      .map(String)
      .filter((d): d is Duty => (DUTIES as readonly string[]).includes(d)),
  );

  const supabase = await createClient();
  const { data: staff } = await supabase.from("staff").select("app_role").eq("id", staff_id).single();
  if (staff?.app_role !== "teacher") return { error: "Duties are only for teachers. Admin already has full access." };

  const { data: current, error: readErr } = await supabase.from("staff_permissions").select("duty").eq("staff_id", staff_id);
  if (readErr) return { error: friendlyDbError(readErr) };
  const have = new Set((current ?? []).map((r) => r.duty));

  const revoke = [...have].filter((d) => !wanted.has(d));
  const grant = [...wanted].filter((d) => !have.has(d));
  if (revoke.length) {
    const { error } = await supabase.from("staff_permissions").delete().eq("staff_id", staff_id).in("duty", revoke);
    if (error) return { error: friendlyDbError(error) };
  }
  if (grant.length) {
    const { error } = await supabase.from("staff_permissions").insert(grant.map((duty) => ({ staff_id, duty })));
    if (error) return { error: friendlyDbError(error) };
  }
  revalidatePath("/staff", "layout");
  if (!grant.length && !revoke.length) return { ok: true, message: "No changes." };
  return { ok: true, message: `Duties saved (${grant.length} added, ${revoke.length} removed).` };
}
