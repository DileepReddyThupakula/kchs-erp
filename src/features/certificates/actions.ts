"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePage } from "@/features/students/page-guard";
import type { Bundle, CheckItem, Kind, Lang } from "./shared";

export type Res<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

const GUARD = "/students/certificates";

/** A database message as a plain sentence (the database says it in words already). */
function plain(message: string | undefined): string {
  if (!message) return "Something went wrong. Nothing was changed.";
  if (/permission denied|not allowed/i.test(message)) return "You do not have access to this.";
  return message;
}

export async function searchStudents(q: string, kind: Kind): Promise<Res<{ rows: { id: string; name: string; admission_no: string; status: string; class: string | null }[] }>> {
  await requirePage(GUARD);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("certificate_student_search", { p_q: q, p_kind: kind });
  if (error) return { ok: false, error: plain(error.message) };
  return { ok: true, rows: (data as never) ?? [] };
}

export async function previewCertificate(kind: Kind, student: string, language: Lang, data: Record<string, unknown>): Promise<Res<{ bundle: Bundle }>> {
  await requirePage(GUARD);
  const supabase = await createClient();
  const { data: b, error } = await supabase.rpc("certificate_preview", { p_kind: kind, p_student: student, p_language: language, p_data: JSON.parse(JSON.stringify(data)) });
  if (error) return { ok: false, error: plain(error.message) };
  return { ok: true, bundle: b as unknown as Bundle };
}

/** The TC checklist (Admin only; it shows dues). */
export async function tcChecklist(student: string, leaving: string | null): Promise<Res<{ items: CheckItem[] }>> {
  await requirePage(GUARD);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("certificate_checklist", { p_student: student, p_leaving: leaving ?? undefined });
  if (error) return { ok: false, error: plain(error.message) };
  return { ok: true, items: data as unknown as CheckItem[] };
}

export async function issueCertificate(kind: Kind, student: string, language: Lang, data: Record<string, unknown>, override: boolean, overrideReason: string): Promise<Res<{ id: string; number: string }>> {
  await requirePage(GUARD);
  const supabase = await createClient();
  const { data: r, error } = await supabase.rpc("certificate_issue", {
    p_kind: kind, p_student: student, p_language: language, p_data: JSON.parse(JSON.stringify(data)), p_override: override, p_override_reason: overrideReason || undefined,
  });
  if (error) return { ok: false, error: plain(error.message) };
  for (const p of ["/students/certificates", "/students", `/students/${student}`]) revalidatePath(p);
  const j = r as unknown as { id: string; number: string };
  return { ok: true, id: j.id, number: j.number };
}

/** A print. The database decides if it is a duplicate (and then needs a reason), writes the log entry, and returns what to print. */
export async function printCertificate(id: string, language: Lang, reason: string, note: string): Promise<Res<{ bundle: Bundle }>> {
  await requirePage(GUARD);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("certificate_print", { p_certificate: id, p_language: language, p_reason: reason || undefined, p_note: note || undefined });
  if (error) return { ok: false, error: plain(error.message) };
  revalidatePath("/students/certificates/register");
  return { ok: true, bundle: data as unknown as Bundle };
}

export async function cancelCheck(id: string): Promise<Res<{ check: { is_tc: boolean; needs_section: boolean; warning: string | null; status_changed_since: boolean } }>> {
  await requirePage(GUARD);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("certificate_cancel_check", { p_certificate: id });
  if (error) return { ok: false, error: plain(error.message) };
  return { ok: true, check: data as never };
}

export async function cancelCertificate(id: string, reason: string, section: string): Promise<Res> {
  await requirePage(GUARD);
  const supabase = await createClient();
  const { error } = await supabase.rpc("certificate_cancel", { p_certificate: id, p_reason: reason, p_section: section || undefined });
  if (error) return { ok: false, error: plain(error.message) };
  for (const p of ["/students/certificates", "/students/certificates/register", "/students"]) revalidatePath(p);
  return { ok: true };
}

/** The register as rows for Excel / CSV. The database writes the "exported" entry in the same call. */
export async function exportRegister(kind: Kind, year: string, format: "csv" | "xlsx"): Promise<Res<{ headers: string[]; rows: (string | number | null)[][] }>> {
  await requirePage(GUARD);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("certificate_register_export", { p_kind: kind, p_year: year, p_format: format });
  if (error) return { ok: false, error: plain(error.message) };
  const rows = ((data as unknown as { rows: Record<string, unknown>[] }).rows ?? []);
  const prints = (r: Record<string, unknown>) => ((r.prints as { copy_no: number; at: string; duplicate: boolean; reason: string | null }[]) ?? []).map((p) => `#${p.copy_no} ${String(p.at).slice(0, 10)}${p.duplicate ? ` duplicate (${p.reason})` : ""}`).join("; ");
  return {
    ok: true,
    headers: ["Number", "Student", "Admission no", "Date of issue", "Issued by", "Status", "Language", kind === "bonafide" ? "Purpose" : kind === "tc" ? "Leaving date" : "—", "Copies printed", "Prints", "Cancel reason"],
    rows: rows.map((r) => [r.number as string, r.student as string, r.admission_no as string, r.issue_date as string, (r.issued_by as string) ?? "", r.status as string, r.language as string,
      kind === "bonafide" ? ((r.purpose as string) ?? "") : kind === "tc" ? ((r.leaving_date as string) ?? "") : "", Number(r.copies), prints(r), (r.cancel_reason as string) ?? ""]),
  };
}

// ------------------------------------------------------------------ settings (Admin only: the database refuses anyone else)
async function settings(fn: (s: Awaited<ReturnType<typeof createClient>>) => PromiseLike<{ error: { message: string } | null }>): Promise<Res> {
  await requirePage(GUARD);
  const supabase = await createClient();
  const { error } = await fn(supabase);
  if (error) return { ok: false, error: plain(error.message) };
  revalidatePath("/students/certificates/settings");
  return { ok: true };
}
export async function savePrefixes(tc: string, bonafide: string, study: string): Promise<Res> {
  return settings((s) => s.rpc("certificate_settings_save", { p_prefix_tc: tc, p_prefix_bonafide: bonafide, p_prefix_study: study }));
}
export async function setStartNumber(kind: Kind, year: string, n: number): Promise<Res> {
  return settings((s) => s.rpc("certificate_set_start", { p_kind: kind, p_year: year, p_start: n }));
}
export async function setDraft(kind: Kind, draft: boolean): Promise<Res> {
  return settings((s) => s.rpc("certificate_template_set_draft", { p_kind: kind, p_layout_draft: draft }));
}
export async function confirmWording(kind: Kind, wording: boolean): Promise<Res> {
  return settings((s) => s.rpc("certificate_template_set_draft", { p_kind: kind, p_layout_draft: null as never, p_wording_confirmed: wording }));
}
export async function saveText(kind: Kind, key: string, en: string, te: string): Promise<Res> {
  return settings((s) => s.rpc("certificate_template_save", { p_kind: kind, p_key: key, p_en: en, p_te: te }));
}
export async function confirmTelugu(kind: Kind, key?: string): Promise<Res> {
  return settings((s) => s.rpc("certificate_template_confirm_telugu", { p_kind: kind, p_key: key }));
}
export async function setSignatureImage(on: boolean): Promise<Res> {
  return settings((s) => s.rpc("certificate_signature_image", { p_on: on }));
}
