"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireCapability } from "@/lib/auth/session";
import { ASSIGNABLE_ROLES, DUTIES, dutiesFor, type Duty } from "@/lib/auth/permissions";
import { friendlyDbError, type ActionState } from "@/lib/utils";
import { passwordSchema } from "./password";
import { MUST_CHANGE_KEY } from "@/lib/auth/force-change";
import { loginLabel, parseLoginId } from "@/lib/auth/login-id.mjs";

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

/**
 * Belt and braces on top of the database (which already refuses a deactivated / role-less person on every
 * query): also stop their Auth login from getting NEW tokens. Banned = refresh tokens stop working, so the
 * session ends when the current access token (max 1 hour) expires. The ban is lifted when they are active again.
 */
async function syncLoginBan(staffId: string, blocked: boolean) {
  try {
    const supabase = await createClient();
    const { data } = await supabase.from("staff").select("user_id").eq("id", staffId).maybeSingle();
    if (!data?.user_id) return;
    await createAdminClient().auth.admin.updateUserById(data.user_id, { ban_duration: blocked ? "876000h" : "none" });
  } catch {
    // the database already refuses them; a failed ban must not fail the save
  }
}

export async function saveStaff(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("staff.edit");
  const parsed = staffSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, error: "Please fix the highlighted fields." };
  const id = fd.get("id")?.toString();
  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("staff").update(parsed.data).eq("id", id);
    if (error) return { error: error.code === "23505" ? "Another staff member has this employee code." : friendlyDbError(error) };
    await syncLoginBan(id, parsed.data.status !== "active");
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

const loginIdField = z.string().trim().min(1, "Enter a mobile number, a username or an email").max(120);

/** Create an Auth login for a staff member and give it a role. Admin only. The login ID is an email, a 10-digit mobile number or a username. */
export async function createLogin(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("users.manage");
  const parsed = z
    .object({
      staff_id: z.string().uuid(),
      login_id: loginIdField,
      email: z.string().trim().toLowerCase().max(120).optional().or(z.literal("")),   // the real contact email (optional)
      password: passwordSchema,
      app_role: roleSchema,
    })
    .safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const { staff_id, password, app_role } = parsed.data;
  const id = parseLoginId(parsed.data.login_id);
  if (!id.ok) return { fieldErrors: { login_id: [id.error] } };
  let contact: string | null = parsed.data.email || null;
  if (contact) { const c = parseLoginId(contact); if (!c.ok || c.kind !== "email") return { fieldErrors: { email: ["Enter a real email address, or leave it empty"] } }; contact = c.canonical; }
  if (id.kind === "email") contact = contact ?? id.canonical;

  const supabase = await createClient();
  const { data: taken } = await supabase.from("staff_logins").select("id").eq("login_id", id.canonical).maybeSingle();
  if (taken) return { fieldErrors: { login_id: [id.kind === "mobile" ? "Another staff member already uses this number to sign in. Give this person a username instead." : "This login ID is already used by someone else."] } };

  const admin = createAdminClient();
  const { data: created, error: authErr } = await admin.auth.admin.createUser({ email: id.authEmail, password, email_confirm: true, app_metadata: { [MUST_CHANGE_KEY]: true } });
  if (authErr || !created.user) {
    return { error: authErr?.message.includes("already") ? "A login with this ID already exists." : (console.error("[auth-error]", authErr?.message), "Could not create the login. Please try again.") };
  }

  // Link via the Admin's own session so RLS + audit log record who did it.
  const link = await supabase.from("staff").update({ user_id: created.user.id, app_role, ...(contact ? { email: contact } : {}) }).eq("id", staff_id);
  const ins = link.error ? null : await supabase.from("staff_logins").upsert({ staff_id, login_id: id.canonical, kind: id.kind }, { onConflict: "staff_id" });
  const error = link.error ?? ins?.error ?? null;
  if (error) {
    await admin.auth.admin.deleteUser(created.user.id); // roll back the orphan login
    await supabase.from("staff").update({ user_id: null, app_role: null }).eq("id", staff_id);
    return { error: friendlyDbError(error) };
  }
  await supabase.rpc("log_event", { p_action: "staff.login_created", p_table: "staff", p_record_id: staff_id, p_details: { role: app_role, login: loginLabel(id), kind: id.kind } });
  revalidatePath("/staff", "layout");
  return { ok: true, message: "Login created. Share the password with the staff member in person. They must choose their own password the first time they sign in." };
}

/** Change a staff member's login ID (for example a new mobile number). Same account, same password. Admin only. */
export async function changeLoginId(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("users.manage");
  const parsed = z.object({ staff_id: z.string().uuid(), login_id: loginIdField }).safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const id = parseLoginId(parsed.data.login_id);
  if (!id.ok) return { fieldErrors: { login_id: [id.error] } };
  const supabase = await createClient();
  const [{ data: staff }, { data: cur }, { data: taken }] = await Promise.all([
    supabase.from("staff").select("user_id").eq("id", parsed.data.staff_id).single(),
    supabase.from("staff_logins").select("login_id").eq("staff_id", parsed.data.staff_id).maybeSingle(),
    supabase.from("staff_logins").select("staff_id").eq("login_id", id.canonical).maybeSingle(),
  ]);
  if (!staff?.user_id) return { error: "This staff member has no login." };
  if (taken && taken.staff_id !== parsed.data.staff_id) return { fieldErrors: { login_id: [id.kind === "mobile" ? "Another staff member already uses this number to sign in. Give this person a username instead." : "This login ID is already used by someone else."] } };
  if (cur?.login_id === id.canonical) return { ok: true, message: "That is already the login ID." };
  const admin = createAdminClient();
  const before = cur ? parseLoginId(cur.login_id) : null;
  const { error: authErr } = await admin.auth.admin.updateUserById(staff.user_id, { email: id.authEmail, email_confirm: true });
  if (authErr) { console.error("[auth-error]", authErr.message); return { error: "Could not change the login ID. Please try again." }; }
  const { error } = await supabase.from("staff_logins").upsert({ staff_id: parsed.data.staff_id, login_id: id.canonical, kind: id.kind }, { onConflict: "staff_id" });
  if (error) {
    if (before?.ok) await admin.auth.admin.updateUserById(staff.user_id, { email: before.authEmail, email_confirm: true });   // put the old one back
    return { error: friendlyDbError(error) };
  }
  await supabase.rpc("log_event", { p_action: "staff.login_id_changed", p_table: "staff", p_record_id: parsed.data.staff_id, p_details: { from: before?.ok ? loginLabel(before) : "none", to: loginLabel(id) } });
  revalidatePath("/staff", "layout");
  return { ok: true, message: "Login ID changed. The password stays the same." };
}

export async function changeRole(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("users.manage");
  const staff_id = z.string().uuid().parse(fd.get("staff_id"));
  const raw = fd.get("app_role")?.toString() ?? "";
  const app_role = raw === "" ? null : roleSchema.parse(raw);
  const supabase = await createClient();
  const { error } = await supabase.from("staff").update({ app_role }).eq("id", staff_id);
  if (error) return { error: friendlyDbError(error) };
  await syncLoginBan(staff_id, app_role === null);
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
  const { error } = await createAdminClient().auth.admin.updateUserById(staff.user_id, { password: parsed.data.password, app_metadata: { [MUST_CHANGE_KEY]: true } });
  if (error) { console.error("[auth-error]", error.message); return { error: "Could not set the password. Please try again." }; }
  await supabase.rpc("log_event", { p_action: "staff.password_reset", p_table: "staff", p_record_id: parsed.data.staff_id });
  return { ok: true, message: "Password changed. They must choose their own password the next time they sign in." };
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
  if (staff?.app_role !== "teacher" && staff?.app_role !== "computer_staff") return { error: "Duties are only for teachers and office staff. Admin already has full access." };
  const allowed = new Set<string>(dutiesFor(staff.app_role));
  if ([...wanted].some((d) => !allowed.has(d))) return { error: "Fee access can only be given to office staff, never to a teacher." };

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
