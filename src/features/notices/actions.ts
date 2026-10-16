"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability, requireStaff } from "@/lib/auth/session";
import { ATTACH_MAX, ATTACH_TYPES } from "./shared";

const uuid = z.string().uuid();
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export type NtResult<T = unknown> = ({ ok: true; message?: string } & T) | { ok: false; error: string };
const fail = (error: string): { ok: false; error: string } => ({ ok: false, error });

function msg(err: { code?: string; message: string }): string {
  if (err.code === "42501") return "You don't have permission to do this.";
  return err.message;
}
function refresh() {
  revalidatePath("/diary", "layout");
  revalidatePath("/notices", "layout");
  revalidatePath("/dashboard");
}

// ------------------------------------------------------------------ diary
export async function saveDiaryDay(input: { date: string; sectionIds: string[]; items: { subjectId: string | null; body: string }[]; publish: boolean }): Promise<NtResult<{ count: number }>> {
  await requireCapability("notices.edit");
  if (!DATE.test(input.date) || !input.sectionIds.length || !input.sectionIds.every((s) => uuid.safeParse(s).success)) return fail("Choose the date and at least one section.");
  const items = input.items.map((i) => ({ subject_id: i.subjectId, body: i.body.trim() })).filter((i) => i.body.length > 0);
  if (!items.length) return fail("Write at least one line.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_diary_day", { p_date: input.date, p_section_ids: input.sectionIds, p_items: items, p_publish: input.publish });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: input.publish ? `${data.length} diary line(s) published.` : `${data.length} line(s) saved as drafts.`, count: data.length };
}

export async function saveDiaryEntry(input: { id: string; date: string; sectionIds: string[]; subjectId: string | null; body: string; status: "draft" | "published" }): Promise<NtResult> {
  await requireCapability("notices.edit");
  if (!uuid.safeParse(input.id).success || !DATE.test(input.date) || !input.sectionIds.length) return fail("Choose the date and at least one section.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("save_diary", { p: { id: input.id, entry_date: input.date, section_ids: input.sectionIds, subject_id: input.subjectId, body: input.body, status: input.status } });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: "Diary entry saved." };
}

export async function setDiaryStatus(id: string, status: "draft" | "published"): Promise<NtResult> {
  await requireCapability("notices.edit");
  if (!uuid.safeParse(id).success) return fail("Invalid entry.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_diary_status", { p_id: id, p_status: status });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: status === "published" ? "Published." : "Moved back to draft." };
}

export async function archiveDiary(id: string, archive: boolean): Promise<NtResult> {
  await requireCapability("records.delete"); // Admin only
  if (!uuid.safeParse(id).success) return fail("Invalid entry.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_diary", { p_id: id, p_archive: archive });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: archive ? "Entry archived." : "Entry restored." };
}

// ------------------------------------------------------------------ notices
const noticeSchema = z.object({
  id: uuid.optional(),
  title: z.string().trim().min(3, "Give the notice a title"),
  body: z.string().trim().min(2, "Write the notice text"),
  audience: z.enum(["all", "roles", "classes", "teachers"]),
  roles: z.array(z.enum(["admin", "teacher"])).default([]),
  classIds: z.array(uuid).default([]),
  staffIds: z.array(uuid).default([]),
  publishDate: z.string().regex(DATE).optional(),
  expiresOn: z.string().regex(DATE).nullable().optional(),
  important: z.boolean().default(false),
});

export async function saveNotice(input: z.input<typeof noticeSchema>, publish: boolean): Promise<NtResult<{ id: string; circularNo: string | null }>> {
  await requireCapability("notices.edit");
  const p = noticeSchema.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Please check the notice.");
  const v = p.data;
  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("save_notice", {
    p: { id: v.id ?? null, title: v.title, body: v.body, audience: v.audience, roles: v.roles, class_ids: v.classIds, staff_ids: v.staffIds, publish_date: v.publishDate ?? null, expires_on: v.expiresOn ?? null, important: v.important },
  });
  if (error) return fail(msg(error));
  let circularNo: string | null = null;
  if (publish) {
    const r = await supabase.rpc("publish_notice", { p_id: id });
    if (r.error) return fail(msg(r.error));
    circularNo = r.data;
  }
  refresh();
  return { ok: true, id, circularNo, message: publish ? `Published as ${circularNo}.` : "Saved as a draft." };
}

export async function publishNotice(id: string): Promise<NtResult<{ circularNo: string }>> {
  await requireCapability("notices.edit");
  if (!uuid.safeParse(id).success) return fail("Invalid notice.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publish_notice", { p_id: id });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, circularNo: data, message: `Published as ${data}.` };
}

export async function archiveNotice(id: string, archive: boolean): Promise<NtResult> {
  await requireCapability("records.delete"); // Admin only
  if (!uuid.safeParse(id).success) return fail("Invalid notice.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("archive_notice", { p_id: id, p_archive: archive });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: archive ? "Notice archived." : "Notice restored." };
}

export async function markNoticeRead(id: string): Promise<NtResult> {
  await requireStaff();
  if (!uuid.safeParse(id).success) return fail("Invalid notice.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("mark_notice_read", { p_id: id });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: "Marked as read." };
}

// ------------------------------------------------------------------ attachments
export async function uploadAttachment(formData: FormData): Promise<NtResult> {
  await requireCapability("notices.edit");
  const kind = formData.get("kind");
  const parent = String(formData.get("parent") ?? "");
  const file = formData.get("file");
  if ((kind !== "diary" && kind !== "notice") || !uuid.safeParse(parent).success || !(file instanceof File)) return fail("Choose a file to attach.");
  if (!ATTACH_TYPES.includes(file.type)) return fail("Only PDF and images (JPEG, PNG, WebP) can be attached.");
  if (file.size > ATTACH_MAX) return fail("The file is larger than 5 MB.");
  if (file.size === 0) return fail("The file is empty.");
  const supabase = await createClient();
  const bucket = kind === "diary" ? "diary-files" : "notice-files";
  const safe = file.name.replace(/[^\w.\- ]+/g, "_").slice(-80);
  const path = `${parent}/${crypto.randomUUID()}-${safe}`;
  const up = await supabase.storage.from(bucket).upload(path, file, { contentType: file.type });
  if (up.error) return fail("The file could not be uploaded: " + up.error.message);
  const rpc = kind === "diary" ? "add_diary_attachment" : "add_notice_attachment";
  const { error } =
    kind === "diary"
      ? await supabase.rpc("add_diary_attachment", { p_entry: parent, p_path: path, p_name: file.name, p_mime: file.type, p_size: file.size })
      : await supabase.rpc("add_notice_attachment", { p_notice: parent, p_path: path, p_name: file.name, p_mime: file.type, p_size: file.size });
  void rpc;
  if (error) {
    await supabase.storage.from(bucket).remove([path]);
    return fail(msg(error));
  }
  refresh();
  return { ok: true, message: "File attached." };
}

export async function removeAttachment(kind: "diary" | "notice", id: string): Promise<NtResult> {
  await requireCapability("notices.edit");
  if (!uuid.safeParse(id).success) return fail("Invalid file.");
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("remove_attachment", { p_kind: kind, p_id: id });
  if (error) return fail(msg(error));
  if (path) await supabase.storage.from(kind === "diary" ? "diary-files" : "notice-files").remove([path]);
  refresh();
  return { ok: true, message: "File removed." };
}
