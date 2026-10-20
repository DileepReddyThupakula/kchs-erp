"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePage } from "@/features/students/page-guard";
import type { Bundle, Candidate, SectionOption } from "./shared";

export type Res<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };
const GUARD = "/students/id-cards";

function plain(message: string | undefined): string {
  if (!message) return "Something went wrong. Nothing was changed.";
  if (/permission denied|not allowed/i.test(message)) return "You do not have access to this.";
  return message;
}
async function db() {
  await requirePage(GUARD);
  return createClient();
}

export async function loadSections(): Promise<Res<{ year: string; sections: SectionOption[] }>> {
  const s = await db();
  const { data, error } = await s.rpc("id_card_sections");
  if (error) return { ok: false, error: plain(error.message) };
  const j = data as unknown as { year: string; sections: SectionOption[] };
  return { ok: true, year: j.year, sections: j.sections };
}

export async function loadCandidates(section: string | null, klass: string | null): Promise<Res<{ rows: Candidate[] }>> {
  const s = await db();
  const { data, error } = await s.rpc("id_card_candidates", { p_section: section ?? undefined, p_class: klass ?? undefined });
  if (error) return { ok: false, error: plain(error.message) };
  return { ok: true, rows: data as unknown as Candidate[] };
}

/** The cards as they will look, before any number is given. Signed photo links are made here, on the server. */
export async function previewCards(students: string[]): Promise<Res<{ bundle: Bundle; photos: Record<string, string> }>> {
  const s = await db();
  const { data, error } = await s.rpc("id_card_preview", { p_students: students });
  if (error) return { ok: false, error: plain(error.message) };
  const bundle = data as unknown as Bundle;
  return { ok: true, bundle, photos: await signedPhotos(s, bundle.cards.map((c) => c.photo_path)) };
}

export async function signedPhotos(s: Awaited<ReturnType<typeof createClient>>, paths: (string | null)[]): Promise<Record<string, string>> {
  const list = [...new Set(paths.filter((p): p is string => !!p))];
  if (!list.length) return {};
  const { data } = await s.storage.from("student-photos").createSignedUrls(list, 600);   // ten minutes, private bucket
  const out: Record<string, string> = {};
  for (const d of data ?? []) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

export async function issueCards(students: string[], overrides: Record<string, string>): Promise<Res<{ batchId: string | null; issued: { card_id: string; student_id: string; name: string; number: string }[]; skipped: { student_id: string; name: string; reason: string }[] }>> {
  const s = await db();
  const { data, error } = await s.rpc("id_card_issue", { p_students: students, p_overrides: overrides });
  if (error) return { ok: false, error: plain(error.message) };
  const j = data as unknown as { batch_id: string | null; issued: never[]; skipped: never[] };
  for (const p of ["/students/id-cards", "/students/id-cards/register"]) revalidatePath(p);
  return { ok: true, batchId: j.batch_id, issued: j.issued, skipped: j.skipped };
}

/** The same sheet again (printer jam): the database allows it only for the same person within 10 minutes. */
export async function printCards(cards: string[]): Promise<Res> {
  const s = await db();
  const { error } = await s.rpc("id_card_print", { p_cards: cards });
  if (error) return { ok: false, error: plain(error.message) };
  return { ok: true };
}

export async function replaceCard(card: string, reason: string, note: string, pending: string): Promise<Res<{ cardId: string; number: string }>> {
  const s = await db();
  const { data, error } = await s.rpc("id_card_replace", { p_card: card, p_reason: reason, p_note: note || undefined, p_pending_reason: pending || undefined });
  if (error) return { ok: false, error: plain(error.message) };
  const j = data as unknown as { card_id: string; number: string };
  for (const p of ["/students/id-cards", "/students/id-cards/register"]) revalidatePath(p);
  return { ok: true, cardId: j.card_id, number: j.number };
}

export async function cancelCard(card: string, reason: string): Promise<Res> {
  const s = await db();
  const { error } = await s.rpc("id_card_cancel", { p_card: card, p_reason: reason });
  if (error) return { ok: false, error: plain(error.message) };
  revalidatePath("/students/id-cards/register");
  return { ok: true };
}

export type Lookup = { found: boolean; card_id?: string; number?: string; status?: "issued" | "cancelled"; cancel_kind?: string | null; cancel_reason?: string | null; year?: string; student_id?: string; name?: string; admission_no?: string; class?: string | null; student_status?: string; replaced_by?: string | null };
export async function lookupCard(number: string): Promise<Res<{ result: Lookup }>> {
  const s = await db();
  const { data, error } = await s.rpc("id_card_lookup", { p_number: number });
  if (error) return { ok: false, error: plain(error.message) };
  return { ok: true, result: data as unknown as Lookup };
}

export async function exportRegister(year: string, format: "csv" | "xlsx"): Promise<Res<{ headers: string[]; rows: (string | number | null)[][] }>> {
  const s = await db();
  const { data, error } = await s.rpc("id_card_register_export", { p_year: year, p_format: format });
  if (error) return { ok: false, error: plain(error.message) };
  const rows = (data as unknown as { rows: Record<string, unknown>[] }).rows ?? [];
  return {
    ok: true,
    headers: ["Card number", "Student", "Admission no", "Class", "Section", "Status", "Issued on", "Issued by", "Prints", "Replaced by", "Replaces", "Cancel reason", "Photo pending"],
    rows: rows.map((r) => [r.number as string, r.student as string, r.admission_no as string, r.class as string, r.section as string, r.status as string, String(r.issued_at).slice(0, 10), (r.issued_by as string) ?? "", Number(r.prints),
      (r.replaced_by as string) ?? "", (r.replaces as string) ?? "", r.status === "cancelled" ? `${String(r.cancel_kind).replace("_", " ")}${r.cancel_reason ? `: ${r.cancel_reason}` : ""}` : "", r.photo_pending ? "Yes" : ""]),
  };
}

export async function saveSettings(prefix: string, phone: boolean, blood: boolean): Promise<Res> {
  const s = await db();
  const { error } = await s.rpc("id_card_settings_save", { p_prefix: prefix, p_show_phone: phone, p_show_blood_group: blood });
  if (error) return { ok: false, error: plain(error.message) };
  revalidatePath("/students/id-cards/settings");
  return { ok: true };
}

// ------------------------------------------------------------------ bulk photos
export type PlanRow = { name: string; admission_no: string; student_id: string | null; student: string | null; class: string | null; status: "ok" | "no_match" | "duplicate" | "student_left" | "problem"; problem: string | null; replaces: boolean };
export async function planPhotos(files: { name: string; width: number; height: number; bytes: number; mime: string }[]): Promise<Res<{ rows: PlanRow[] }>> {
  const s = await db();
  const { data, error } = await s.rpc("student_photos_plan", { p_files: files });
  if (error) return { ok: false, error: plain(error.message) };
  return { ok: true, rows: data as unknown as PlanRow[] };
}
export async function recordPhoto(student: string, path: string, w: number, h: number, bytes: number, mime: string): Promise<Res> {
  const s = await db();
  const { error } = await s.rpc("student_photo_set", { p_student: student, p_path: path, p_w: w, p_h: h, p_bytes: bytes, p_mime: mime });
  if (error) return { ok: false, error: plain(error.message) };
  return { ok: true };
}
export async function logBulkPhotos(count: number, label: string): Promise<Res> {
  const s = await db();
  const { error } = await s.rpc("student_photos_bulk_log", { p_count: count, p_label: label });
  if (error) return { ok: false, error: plain(error.message) };
  revalidatePath("/students/id-cards/photos");
  return { ok: true };
}
