"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/auth/session";
import { friendlyDbError, type ActionState } from "@/lib/utils";
import { checkUpload, LOGOS } from "@/lib/upload-check";

const optional = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .nullable();

const schema = z.object({
  name: z.string().trim().min(2, "School name is required"),
  short_name: optional,
  address_line1: optional,
  address_line2: optional,
  city: optional,
  district: optional,
  state: optional,
  pincode: optional.refine((v) => !v || /^\d{6}$/.test(v), "Pincode must be 6 digits"),
  phone: optional,
  email: optional.refine((v) => !v || z.string().email().safeParse(v).success, "Enter a valid email"),
  website: optional,
  board: optional,
  affiliation_no: optional,
  udise_code: optional.refine((v) => !v || /^\d{11}$/.test(v), "UDISE code is 11 digits"),
  principal_name: optional,
  mediums: z
    .string()
    .transform((v) => v.split(",").map((m) => m.trim()).filter(Boolean))
    .refine((a) => a.length > 0, "Add at least one medium"),
  working_days: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Pick at least one working day"),
  second_saturday_holiday: z.boolean(),
  periods_per_day: z.coerce.number().int().min(1).max(15),
  motto: optional,
  admission_no_prefix: z.string().trim(),
  receipt_no_prefix: z.string().trim(),
  circular_prefix: z.string().trim(),
  staff_group_name: z.string().trim(),
  default_pass_percent: z.coerce.number().min(0).max(100),
  translation_monthly_cap: z.coerce.number().int().min(0).max(100000000),
  diary_deadline: z.string().regex(/^\d{2}:\d{2}$/, "Use a time like 15:30"),
});

export async function updateSettings(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireCapability("settings.edit");
  const raw = Object.fromEntries(formData);
  const parsed = schema.safeParse({
    ...raw,
    working_days: formData.getAll("working_days"),
    second_saturday_holiday: formData.get("second_saturday_holiday") === "on",
  });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, error: "Please fix the highlighted fields." };

  const supabase = await createClient();
  const { motto, ...columns } = parsed.data;
  // Motto lives in the `extra` JSON (no dedicated column yet) — merge, don't overwrite.
  const { data: current } = await supabase.from("school_settings").select("extra").eq("id", 1).single();
  const extra = { ...((current?.extra as Record<string, unknown> | null) ?? {}), motto };
  const { error } = await supabase.from("school_settings").update({ ...columns, circular_prefix: columns.circular_prefix || null, staff_group_name: columns.staff_group_name || null, extra }).eq("id", 1);
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: "Settings saved." };
}


/** Upload logo or principal signature to the `branding` bucket. */
export async function uploadBrandingImage(_: ActionState, formData: FormData): Promise<ActionState> {
  await requireCapability("settings.edit");
  const kind = formData.get("kind");
  const file = formData.get("file");
  if (kind !== "logo" && kind !== "signature") return { error: "Unknown image type." };
  if (!(file instanceof File) || file.size === 0) return { error: "Choose an image file." };
  if (file.size > 2 * 1024 * 1024) return { error: "Image must be under 2 MB." };
  const real = await checkUpload(file, LOGOS);
  if (!real.ok) return { error: "Use a PNG or JPG image. " + real.error };

  const supabase = await createClient();
  const path = `${kind}-${Date.now()}.${real.ext}`;
  const { error: upErr } = await supabase.storage.from("branding").upload(path, file, { contentType: real.mime });
  if (upErr) return { error: friendlyDbError(upErr as { message: string }) };

  const patch = kind === "logo" ? { logo_path: path } : { principal_signature_path: path };
  const { error } = await supabase.from("school_settings").update(patch).eq("id", 1);
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/", "layout");
  return { ok: true, message: kind === "logo" ? "Logo updated." : "Signature updated." };
}
