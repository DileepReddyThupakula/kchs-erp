"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability } from "@/lib/auth/session";
import { parseRupees } from "@/lib/money";
import { friendlyDbError, type ActionState } from "@/lib/utils";
import type { Json } from "@/types/database";
import { UPI_ID_RE } from "./upi";
import { getFeeHeads, toDueRow, type DueRow } from "./queries";
import { checkUpload, IMAGES } from "@/lib/upload-check";
import { demoBlock } from "@/lib/demo";

const uuid = z.string().uuid();
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function invalid(msg: string, field?: string): ActionState {
  return field ? { fieldErrors: { [field]: [msg] }, error: msg } : { error: msg };
}
function refresh(...paths: string[]) {
  for (const p of paths) revalidatePath(p, "layout");
}
/** Map the database's readable errors to friendly text. */
function dbMessage(err: { code?: string; message: string }) {
  if (err.code === "42501") return "You don't have permission to do this.";
  return friendlyDbError(err);
}

// ------------------------------------------------------------------ fee heads
export async function saveFeeHead(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("fees.setup");
  const parsed = z
    .object({
      id: uuid.optional().or(z.literal("")),
      name: z.string().trim().min(2, "Name is required"),
      code: z.string().trim().max(20).optional(),
      sort_order: z.coerce.number().int().default(0),
      is_active: z.boolean(),
    })
    .safeParse({ ...Object.fromEntries(fd), is_active: fd.get("is_active") !== "off" });
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, error: "Please fix the highlighted fields." };
  const { id, code, ...rest } = parsed.data;
  const row = { ...rest, code: code || null };
  const supabase = await createClient();
  const { error } = id ? await supabase.from("fee_heads").update(row).eq("id", id) : await supabase.from("fee_heads").insert(row);
  if (error) return invalid(error.code === "23505" ? "A fee head with this name or code already exists." : dbMessage(error));
  refresh("/fees");
  return { ok: true, message: id ? "Fee head updated." : "Fee head added." };
}

// ------------------------------------------------------------------ amounts per class
export async function saveClassFees(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("fees.setup");
  const yearId = uuid.safeParse(fd.get("year_id"));
  const classId = uuid.safeParse(fd.get("class_id"));
  if (!yearId.success || !classId.success) return invalid("Invalid class or year.");
  const rows: { academic_year_id: string; class_id: string; fee_head_id: string; amount_paise: number; default_plan_id: string | null }[] = [];
  const fieldErrors: Record<string, string[]> = {};
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("amount.")) continue;
    const headId = k.slice(7);
    if (!uuid.safeParse(headId).success) continue;
    const text = String(v).trim();
    const paise = text === "" ? 0 : parseRupees(text);
    if (paise === null) {
      fieldErrors[k] = ["Enter an amount like 8250 or 8250.50"];
      continue;
    }
    const plan = String(fd.get(`plan.${headId}`) ?? "");
    if (paise > 0 && !uuid.safeParse(plan).success) {
      fieldErrors[`plan.${headId}`] = ["Choose a plan"];
      continue;
    }
    rows.push({ academic_year_id: yearId.data, class_id: classId.data, fee_head_id: headId, amount_paise: paise, default_plan_id: uuid.safeParse(plan).success ? plan : null });
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors, error: "Please fix the highlighted fields." };
  const supabase = await createClient();
  const { error } = await supabase.from("fee_structure").upsert(rows, { onConflict: "academic_year_id,class_id,fee_head_id" });
  if (error) return invalid(dbMessage(error));
  refresh("/fees", "/students");
  return { ok: true, message: "Saved. Students of this class now have updated dues (paid amounts are never changed)." };
}

// ------------------------------------------------------------------ plans
type InstallmentInput = { seq?: number; label: string; due_date: string; share_bp?: number };

export async function savePlan(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("fees.setup");
  const id = String(fd.get("id") ?? "");
  const yearId = uuid.safeParse(fd.get("year_id"));
  const name = String(fd.get("name") ?? "").trim();
  const kind = String(fd.get("kind") ?? "");
  const dueDay = Number(fd.get("due_day") ?? 10);
  if (!yearId.success) return invalid("Invalid year.");
  if (name.length < 2) return invalid("Name is required", "name");
  if (!["one_time", "monthly", "custom"].includes(kind)) return invalid("Choose a plan type", "kind");
  if (!(dueDay >= 1 && dueDay <= 28)) return invalid("Due day must be between 1 and 28", "due_day");

  let items: InstallmentInput[] = [];
  try {
    items = JSON.parse(String(fd.get("installments") ?? "[]"));
  } catch {
    return invalid("Could not read the installments.");
  }
  for (const it of items) {
    if (!DATE.test(it.due_date ?? "")) return invalid("Every installment needs a due date.", "installments");
  }
  if (kind === "custom") {
    if (items.length < 1) return invalid("Add at least one installment.", "installments");
    const sum = items.reduce((a, i) => a + Math.round(Number(i.share_bp ?? 0)), 0);
    if (sum !== 10000) return invalid(`Installment percentages add up to ${(sum / 100).toFixed(2)}%, they must be exactly 100%.`, "installments");
  }

  const supabase = await createClient();
  let planId = id;
  if (!id) {
    const { data, error } = await supabase.from("fee_plans").insert({ academic_year_id: yearId.data, name, kind: kind as "one_time" | "monthly" | "custom", due_day: dueDay }).select("id").single();
    if (error) return invalid(error.code === "23505" ? "A plan with this name already exists for this year." : dbMessage(error));
    planId = data.id;
    if (kind === "custom") {
      const { error: e2 } = await supabase.from("fee_plan_installments").insert(
        items.map((it, i) => ({ plan_id: planId, seq: i + 1, label: it.label?.trim() || `Part ${i + 1}`, due_date: it.due_date, share_bp: Math.round(Number(it.share_bp)) })),
      );
      if (e2) {
        await supabase.from("fee_plans").delete().eq("id", planId);
        return invalid(dbMessage(e2));
      }
    }
  } else {
    const { data: cur } = await supabase.from("fee_plans").select("kind, due_day").eq("id", id).single();
    if (!cur) return invalid("Plan not found.");
    const patch: { name: string; due_day?: number } = { name };
    if (cur.kind !== "custom" && cur.due_day !== dueDay) patch.due_day = dueDay; // moves every installment to the new day
    const { error } = await supabase.from("fee_plans").update(patch).eq("id", id);
    if (error) return invalid(error.code === "23505" ? "A plan with this name already exists for this year." : dbMessage(error));
    if (cur.kind === "custom") {
      await supabase.from("fee_plan_installments").delete().eq("plan_id", id);
      const { error: e2 } = await supabase.from("fee_plan_installments").insert(
        items.map((it, i) => ({ plan_id: id, seq: i + 1, label: it.label?.trim() || `Part ${i + 1}`, due_date: it.due_date, share_bp: Math.round(Number(it.share_bp)) })),
      );
      if (e2) return invalid(dbMessage(e2));
    } else {
      for (const it of items) {
        if (it.seq == null) continue;
        await supabase.from("fee_plan_installments").update({ due_date: it.due_date }).eq("plan_id", id).eq("seq", it.seq);
      }
    }
  }
  const { error: regen } = await supabase.rpc("regenerate_fee_dues", { p_year: yearId.data });
  if (regen) return invalid(`Plan saved, but updating dues failed: ${dbMessage(regen)}`);
  refresh("/fees");
  return { ok: true, message: "Plan saved. Unpaid dues now follow the new schedule." };
}

export async function regenerateYearDues(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("fees.setup");
  const yearId = uuid.safeParse(fd.get("year_id"));
  if (!yearId.success) return invalid("Invalid year.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("regenerate_fee_dues", { p_year: yearId.data });
  if (error) return invalid(dbMessage(error));
  refresh("/fees");
  return { ok: true, message: `Dues checked for ${data} students. Paid amounts were not changed.` };
}

// ------------------------------------------------------------------ special fees
function classAmounts(fd: FormData) {
  const out: { class_id: string; amount_paise: number }[] = [];
  const errors: Record<string, string[]> = {};
  for (const [k, v] of fd.entries()) {
    if (!k.startsWith("class_amount.")) continue;
    const text = String(v).trim();
    if (text === "") continue;
    const paise = parseRupees(text);
    if (paise === null) errors[k] = ["Enter an amount like 800 or 800.50"];
    else out.push({ class_id: k.slice(13), amount_paise: paise });
  }
  return { out, errors };
}

export async function createSpecialFee(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("fees.setup");
  const g = (k: string) => String(fd.get(k) ?? "").trim();
  const mode = g("amount_mode");
  const audience = g("audience");
  const planMode = g("plan_mode");
  let ids: string[] = [];
  let installments: InstallmentInput[] = [];
  try {
    ids = JSON.parse(g("audience_ids") || "[]");
    installments = JSON.parse(g("installments") || "[]");
  } catch {
    return invalid("Could not read the form.");
  }
  if (g("name").length < 2) return invalid("Give the special fee a name", "name");
  if (!uuid.safeParse(g("year_id")).success) return invalid("Invalid year.");
  const payload: Record<string, Json | undefined> = {
    academic_year_id: g("year_id"),
    name: g("name"),
    description: g("description"),
    amount_mode: mode,
    audience,
    audience_ids: ids,
    apply_concessions: fd.get("apply_concessions") === "on",
  };
  if (mode === "flat") {
    const p = parseRupees(g("amount"));
    if (p === null || p <= 0) return invalid("Enter the amount (more than zero)", "amount");
    payload.amount_paise = p;
  } else {
    const { out, errors } = classAmounts(fd);
    if (Object.keys(errors).length) return { fieldErrors: errors, error: "Please fix the highlighted amounts." };
    if (!out.length) return invalid("Enter an amount for at least one class.");
    payload.class_amounts = out;
  }
  if (planMode === "custom") {
    if (installments.length < 2) return invalid("Add at least two installments, or choose One-time.", "installments");
    if (installments.some((i) => !DATE.test(i.due_date ?? ""))) return invalid("Every installment needs a due date.", "installments");
    payload.installments = installments.map((i) => ({ label: i.label, due_date: i.due_date, share_bp: Math.round(Number(i.share_bp)) }));
  } else {
    if (!DATE.test(g("due_date"))) return invalid("Pick the due date", "due_date");
    payload.due_date = g("due_date");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_special_fee", { p: payload as Json });
  if (error) return invalid(dbMessage(error));
  refresh("/fees");
  return { ok: true, message: "Special fee created. Dues were generated for the chosen students." };
}

export async function updateSpecialFee(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("fees.setup");
  const g = (k: string) => String(fd.get(k) ?? "").trim();
  const id = uuid.safeParse(g("id"));
  if (!id.success) return invalid("Invalid special fee.");
  const payload: Record<string, Json> = { description: g("description"), apply_concessions: fd.get("apply_concessions") === "on" };
  if (g("amount_mode") === "flat") {
    const p = parseRupees(g("amount"));
    if (p === null || p <= 0) return invalid("Enter the amount (more than zero)", "amount");
    payload.amount_paise = p;
  } else {
    const { out, errors } = classAmounts(fd);
    if (Object.keys(errors).length) return { fieldErrors: errors, error: "Please fix the highlighted amounts." };
    payload.class_amounts = out;
  }
  if (g("due_date")) {
    if (!DATE.test(g("due_date"))) return invalid("Pick a valid due date", "due_date");
    payload.due_date = g("due_date");
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_special_fee", { p_id: id.data, p: payload as Json });
  if (error) return invalid(dbMessage(error));
  refresh("/fees");
  return { ok: true, message: "Special fee updated. Only unpaid dues changed." };
}

export async function addSpecialFeeStudents(id: string, studentIds: string[]): Promise<ActionState> {
  await requireCapability("fees.setup");
  const parsed = z.object({ id: uuid, ids: z.array(uuid).min(1).max(500) }).safeParse({ id, ids: studentIds });
  if (!parsed.success) return invalid("Choose at least one student.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_special_fee_students", { p_id: parsed.data.id, p_student_ids: parsed.data.ids });
  if (error) return invalid(dbMessage(error));
  refresh("/fees");
  return { ok: true, message: data ? `Added ${data} student(s) and generated their dues.` : "Those students were already included." };
}

export async function cancelSpecialFee(id: string, reason: string): Promise<ActionState> {
  await requireCapability("fees.setup");
  if (!uuid.safeParse(id).success) return invalid("Invalid special fee.");
  if (reason.trim().length < 3) return invalid("Give a reason for cancelling.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_special_fee", { p_id: id, p_reason: reason });
  if (error) return invalid(dbMessage(error));
  refresh("/fees");
  return { ok: true, message: `Cancelled. ${data} unpaid due(s) removed; payments already made are untouched.` };
}

// ------------------------------------------------------------------ concessions
export async function saveConcession(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("fees.setup");
  const g = (k: string) => String(fd.get(k) ?? "").trim();
  const id = g("id");
  if (!uuid.safeParse(g("student_id")).success) return invalid("Choose a student", "student_id");
  if (!uuid.safeParse(g("year_id")).success) return invalid("Invalid year.");
  if (g("reason").length < 3) return invalid("Give a reason (at least 3 letters)", "reason");
  const kind = g("kind");
  const row: { student_id: string; academic_year_id: string; fee_head_id: string | null; kind: "fixed" | "percent"; amount_paise: number | null; percent_bp: number | null; reason: string } = {
    student_id: g("student_id"),
    academic_year_id: g("year_id"),
    fee_head_id: uuid.safeParse(g("fee_head_id")).success ? g("fee_head_id") : null,
    kind: kind === "percent" ? "percent" : "fixed",
    amount_paise: null,
    percent_bp: null,
    reason: g("reason"),
  };
  if (kind === "percent") {
    const pct = Number(g("value"));
    if (!(pct > 0 && pct <= 100)) return invalid("Enter a percentage between 0.01 and 100", "value");
    row.percent_bp = Math.round(pct * 100);
  } else {
    const p = parseRupees(g("value"));
    if (p === null || p <= 0) return invalid("Enter the amount in rupees", "value");
    row.amount_paise = p;
  }
  const supabase = await createClient();
  const { error } = id ? await supabase.from("fee_concessions").update(row).eq("id", id) : await supabase.from("fee_concessions").insert(row);
  if (error) return invalid(dbMessage(error));
  refresh("/fees", "/students");
  return { ok: true, message: id ? "Concession updated. Unpaid dues were recalculated." : "Concession added. Unpaid dues were recalculated." };
}

export async function deleteConcession(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("fees.setup");
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return invalid("Invalid concession.");
  const supabase = await createClient();
  const { error } = await supabase.from("fee_concessions").delete().eq("id", id.data);
  if (error) return invalid(dbMessage(error));
  refresh("/fees");
  return { ok: true, message: "Concession removed. Unpaid dues were recalculated." };
}

// ------------------------------------------------------------------ student fees (Collect fee, profile)
export async function getStudentFeeDues(studentId: string): Promise<{ dues?: DueRow[]; error?: string }> {
  await requireCapability("fees.view");
  if (!uuid.safeParse(studentId).success) return { error: "Invalid student." };
  const supabase = await createClient();
  const [{ all, special }, { data }] = await Promise.all([
    getFeeHeads(supabase),
    supabase.from("student_fee_dues").select("*").eq("student_id", studentId).is("voided_at", null).order("due_date").order("installment_seq"),
  ]);
  const heads = new Map(all.map((h) => [h.id, h]));
  return { dues: (data ?? []).map((d) => toDueRow(d, heads, special)) };
}

// ------------------------------------------------------------------ collect
export type CollectInput = { studentId: string; amountPaise: number; mode: string; reference: string; notes: string; dueIds: string[]; upiConfirmed?: boolean };
export type CollectResult = { ok: true; receiptId: string; receiptNo: string; repeated?: boolean } | { ok: false; error: string };

export async function collectFeeAction(input: CollectInput): Promise<CollectResult> {
  await requireCapability("fees.collect");
  const parsed = z
    .object({
      studentId: uuid,
      amountPaise: z.number().int().positive(),
      mode: z.enum(["cash", "upi", "cheque", "bank_transfer"]),
      reference: z.string().trim().max(60),
      notes: z.string().trim().max(200),
      dueIds: z.array(uuid).max(200),
      upiConfirmed: z.boolean().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the amount, mode and reference." };
  const p = parsed.data;
  // The system can't see the bank. A person must confirm UPI payments.
  if (p.mode === "upi" && !p.upiConfirmed) return { ok: false, error: "Please tick the confirmation that you have seen the payment in the bank / UPI app." };
  const supabase = await createClient();

  // Double-click guard: the same person saving the identical payment within
  // 15 seconds gets the receipt that was just made instead of a second one.
  const since = new Date(Date.now() - 15_000).toISOString();
  const { data: recent } = await supabase
    .from("fee_receipts")
    .select("id, receipt_no, reference_no")
    .eq("student_id", p.studentId)
    .eq("total_paise", p.amountPaise)
    .eq("payment_mode", p.mode)
    .eq("status", "valid")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1);
  const dup = recent?.[0];
  if (dup && (dup.reference_no ?? "") === (p.reference || "")) return { ok: true, receiptId: dup.id, receiptNo: dup.receipt_no, repeated: true };

  const { data, error } = await supabase.rpc("collect_fee", {
    p_student_id: p.studentId,
    p_amount_paise: p.amountPaise,
    p_mode: p.mode,
    p_reference: p.reference || undefined,
    p_notes: p.notes || undefined,
    p_due_ids: p.dueIds.length ? p.dueIds : undefined,
  });
  if (error || !data) return { ok: false, error: error ? dbMessage(error).replace(/\(due: \d+ paise\)/, "") : "Could not save the payment." };
  const { data: rec } = await supabase.from("fee_receipts").select("receipt_no").eq("id", data).single();
  refresh("/fees", "/students");
  return { ok: true, receiptId: data, receiptNo: rec?.receipt_no ?? "" };
}

export type MiscInput = { feeHeadId: string; newHeadName: string; amountPaise: number; mode: string; reference: string; studentId: string; payerName: string; notes: string; upiConfirmed?: boolean };

export async function createMiscReceiptAction(input: MiscInput): Promise<CollectResult> {
  await requireCapability("fees.setup"); // Admin only
  const parsed = z
    .object({
      feeHeadId: z.string(),
      newHeadName: z.string().trim().max(60),
      amountPaise: z.number().int().positive(),
      mode: z.enum(["cash", "upi", "cheque", "bank_transfer"]),
      reference: z.string().trim().max(60),
      studentId: z.string(),
      payerName: z.string().trim().max(80),
      notes: z.string().trim().max(200),
      upiConfirmed: z.boolean().optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please check the amount and mode." };
  if (parsed.data.mode === "upi" && !parsed.data.upiConfirmed) return { ok: false, error: "Please tick the confirmation that you have seen the payment in the bank / UPI app." };
  const p = parsed.data;
  const supabase = await createClient();
  let headId = p.feeHeadId;
  if (!uuid.safeParse(headId).success) {
    if (p.newHeadName.length < 2) return { ok: false, error: "Pick a fee head or type the name of a new one." };
    const { data, error } = await supabase.from("fee_heads").insert({ name: p.newHeadName, sort_order: 150 }).select("id").single();
    if (error) return { ok: false, error: error.code === "23505" ? "A fee head with this name already exists. Pick it from the list." : dbMessage(error) };
    headId = data.id;
  }
  // double-click guard (same as collect)
  const since = new Date(Date.now() - 15_000).toISOString();
  const { data: recent } = await supabase
    .from("fee_receipts")
    .select("id, receipt_no, reference_no, payer_name, student_id")
    .eq("kind", "misc")
    .eq("total_paise", p.amountPaise)
    .eq("payment_mode", p.mode)
    .gte("created_at", since)
    .limit(5);
  const dup = recent?.find((r) => (r.reference_no ?? "") === (p.reference || "") && (r.student_id ?? "") === (p.studentId || "") && (r.payer_name ?? "") === (p.payerName || ""));
  if (dup) return { ok: true, receiptId: dup.id, receiptNo: dup.receipt_no, repeated: true };

  const { data, error } = await supabase.rpc("create_misc_receipt", {
    p_fee_head_id: headId,
    p_amount_paise: p.amountPaise,
    p_mode: p.mode,
    p_reference: p.reference || undefined,
    p_student_id: uuid.safeParse(p.studentId).success ? p.studentId : undefined,
    p_payer_name: p.payerName || undefined,
    p_notes: p.notes || undefined,
  });
  if (error || !data) return { ok: false, error: error ? dbMessage(error) : "Could not save the receipt." };
  const { data: rec } = await supabase.from("fee_receipts").select("receipt_no").eq("id", data).single();
  refresh("/fees");
  return { ok: true, receiptId: data, receiptNo: rec?.receipt_no ?? "" };
}

export async function cancelReceiptAction(id: string, reason: string): Promise<ActionState> {
  await requireCapability("fees.cancelReceipt");
  if (!uuid.safeParse(id).success) return invalid("Invalid receipt.");
  if (reason.trim().length < 3) return invalid("Give a reason for cancelling.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_fee_receipt", { p_receipt_id: id, p_reason: reason });
  if (error) return invalid(dbMessage(error));
  refresh("/fees", "/students");
  return { ok: true, message: "Receipt cancelled. The dues were restored; the receipt number stays visible." };
}

// ------------------------------------------------------------------ payment settings (Admin)
export async function savePaymentSettings(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("fees.setup"); // Admin only; the database refuses anyone else too
  const upi = String(fd.get("upi_id") ?? "").trim();
  const payee = String(fd.get("payee_name") ?? "").trim();
  if (upi && !UPI_ID_RE.test(upi)) return invalid("Enter a valid UPI ID like school@okbank", "upi_id");
  if (upi && payee.length < 2) return invalid("Enter the payee name shown in the UPI app", "payee_name");
  const supabase = await createClient();
  const { error } = await supabase
    .from("fee_settings")
    .update({ upi_id: upi || null, payee_name: payee || null, require_upi_reference: fd.get("require_upi_reference") === "on" })
    .eq("id", 1);
  if (error) return invalid(dbMessage(error));
  refresh("/fees");
  return { ok: true, message: "Payment settings saved." };
}

export async function uploadPaymentQr(_: ActionState, fd: FormData): Promise<ActionState> {
  { const d = demoBlock(); if (d) return d; }   // public demo: turned off
  await requireCapability("fees.setup");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return invalid("Choose the QR image.", "file");
  if (file.size > 2 * 1024 * 1024) return invalid("The image must be under 2 MB.", "file");
  const real = await checkUpload(file, IMAGES);
  if (!real.ok) return invalid("Use a PNG, JPG or WEBP image. " + real.error, "file");
  const supabase = await createClient();
  const { data: cur } = await supabase.from("fee_settings").select("qr_path").eq("id", 1).single();
  const path = `qr-${Date.now()}.${real.ext}`;
  const up = await supabase.storage.from("payment-qr").upload(path, file, { contentType: real.mime });
  if (up.error) return invalid(dbMessage(up.error as { message: string }));
  const { error } = await supabase.from("fee_settings").update({ qr_path: path }).eq("id", 1);
  if (error) return invalid(dbMessage(error));
  if (cur?.qr_path) await supabase.storage.from("payment-qr").remove([cur.qr_path]);
  refresh("/fees");
  return { ok: true, message: "QR image uploaded." };
}

export async function removePaymentQr(): Promise<ActionState> {
  await requireCapability("fees.setup");
  const supabase = await createClient();
  const { data: cur } = await supabase.from("fee_settings").select("qr_path").eq("id", 1).single();
  const { error } = await supabase.from("fee_settings").update({ qr_path: null }).eq("id", 1);
  if (error) return invalid(dbMessage(error));
  if (cur?.qr_path) await supabase.storage.from("payment-qr").remove([cur.qr_path]);
  refresh("/fees");
  return { ok: true, message: "QR image removed." };
}
