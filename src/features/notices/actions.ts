"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability, requireStaff } from "@/lib/auth/session";
import { translateDiaryEntry, REASON_TEXT } from "@/lib/translate/service";
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

export async function setDiaryStatus(id: string, status: "draft" | "submitted" | "published"): Promise<NtResult> {
  await requireCapability("notices.edit");
  if (!uuid.safeParse(id).success) return fail("Invalid entry.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_diary_status", { p_id: id, p_status: status });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: status === "published" ? "Published." : status === "submitted" ? "Unpublished." : "Moved back to draft." };
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
  const kind = formData.get("kind");
  // diary files: the author of an unpublished entry or the duty (the database decides); notice files: the duty
  if (kind === "notice") await requireCapability("notices.edit");
  else await requireStaff();
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
  if (kind === "notice") await requireCapability("notices.edit");
  else await requireStaff();
  if (!uuid.safeParse(id).success) return fail("Invalid file.");
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("remove_attachment", { p_kind: kind, p_id: id });
  if (error) return fail(msg(error));
  if (path) await supabase.storage.from(kind === "diary" ? "diary-files" : "notice-files").remove([path]);
  refresh();
  return { ok: true, message: "File removed." };
}

// ------------------------------------------------------------------ diary workflow
const subjectEntry = z.object({
  sectionId: uuid,
  date: z.string().regex(DATE),
  subjectId: uuid.nullable(),
  body: z.string().trim().min(2, "Write the diary text"),
  bodyTe: z.string().trim().optional(),
});
const teacherEntry = subjectEntry.omit({ bodyTe: true });

/** A teacher saves a draft or submits one subject (or the class remark) for one section and date. */
export async function submitDiary(input: z.input<typeof teacherEntry> & { submit: boolean }): Promise<NtResult<{ id: string }>> {
  await requireStaff();
  const p = teacherEntry.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Please check the entry.");
  const v = p.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("submit_diary", {
    p: { section_id: v.sectionId, entry_date: v.date, subject_id: v.subjectId, kind: v.subjectId ? "subject" : "remark", body: v.body, submit: input.submit },
  });
  if (error) return fail(msg(error));
  // Telugu is generated on Submit only (drafts are never sent to the translation service)
  let note = "";
  if (input.submit) {
    const t = await translateDiaryEntry(data);
    if (t.state === "pending") note = " Translation pending: the school office will add the Telugu.";
  }
  refresh();
  return { ok: true, id: data, message: input.submit ? `Submitted. The school office will review and publish it.${note}` : "Draft saved." };
}

/** Admin / duty: edit any line or add one. */
export async function adminSaveDiaryLine(input: z.input<typeof subjectEntry>): Promise<NtResult<{ id: string }>> {
  await requireCapability("notices.edit");
  const p = subjectEntry.safeParse(input);
  if (!p.success) return fail(p.error.issues[0]?.message ?? "Please check the entry.");
  const v = p.data;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_save_diary_line", {
    p: { section_id: v.sectionId, entry_date: v.date, subject_id: v.subjectId, kind: v.subjectId ? "subject" : "remark", body: v.body, body_te: v.bodyTe || null },
  });
  if (error) return fail(msg(error));
  const t = await translateDiaryEntry(data); // only does anything when the English changed and the Telugu is not reviewed
  refresh();
  return { ok: true, id: data, message: t.state === "pending" && t.reason !== "empty" ? "Line saved. Translation pending." : "Line saved." };
}

export async function publishClassDiary(sectionId: string, date: string): Promise<NtResult<{ count: number }>> {
  await requireCapability("notices.edit");
  if (!uuid.safeParse(sectionId).success || !DATE.test(date)) return fail("Choose a class and a date.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publish_class_diary", { p_section: sectionId, p_date: date });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, count: data, message: data ? `Published ${data} line(s).` : "Everything was already published." };
}

export async function publishAllComplete(date: string): Promise<NtResult<{ count: number }>> {
  await requireCapability("notices.edit");
  if (!DATE.test(date)) return fail("Choose a date.");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publish_all_complete", { p_date: date });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, count: data, message: data ? `Published ${data} complete class(es).` : "No class is complete and waiting to be published." };
}

export async function unpublishClassDiary(sectionId: string, date: string): Promise<NtResult> {
  await requireCapability("notices.edit");
  if (!uuid.safeParse(sectionId).success || !DATE.test(date)) return fail("Choose a class and a date.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("unpublish_class_diary", { p_section: sectionId, p_date: date });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: "Unpublished. Teachers can edit their lines again until you publish." };
}

export async function skipDiarySubject(sectionId: string, date: string, subjectId: string, skip: boolean): Promise<NtResult> {
  await requireCapability("notices.edit");
  if (!uuid.safeParse(sectionId).success || !uuid.safeParse(subjectId).success || !DATE.test(date)) return fail("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("skip_diary_subject", { p_section: sectionId, p_date: date, p_subject: subjectId, p_skip: skip });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: skip ? "Skipped for this day." : "Expected again." };
}

export async function remindDiary(sectionId: string, date: string, subjectId: string | null): Promise<NtResult> {
  await requireCapability("notices.edit");
  if (!uuid.safeParse(sectionId).success || !DATE.test(date) || (subjectId && !uuid.safeParse(subjectId).success)) return fail("Invalid request.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("remind_diary", { p_section: sectionId, p_date: date, p_subject: subjectId });
  if (error) return fail(msg(error));
  refresh();
  return { ok: true, message: "Reminder sent. It shows on the teacher's dashboard." };
}

/** Records that someone opened / copied / printed a share. Never claims delivery. */
export async function logShare(input: { kind: "diary" | "notice"; target: "group" | "student"; sectionId?: string | null; date?: string | null; channel: "app" | "web" | "share" | "copy" | "download" | "print"; summary: string }): Promise<NtResult> {
  await requireCapability("notices.edit");
  const supabase = await createClient();
  const { error } = await supabase.rpc("log_message", {
    p_kind: input.kind,
    p_target: input.target,
    p_student: null,
    p_section: input.sectionId ?? null,
    p_date: input.date ?? null,
    p_channel: input.channel,
    p_summary: input.summary,
  });
  if (error) return fail(msg(error));
  return { ok: true };
}

/** Admin / duty: try the automatic translation again for every pending line of a class and day (or one line). */
export async function retryTranslation(input: { entryId?: string; sectionId?: string; date?: string }): Promise<NtResult<{ done: number; left: number }>> {
  await requireCapability("notices.edit");
  const supabase = await createClient();
  let ids: string[] = [];
  if (input.entryId && uuid.safeParse(input.entryId).success) ids = [input.entryId];
  else if (input.sectionId && input.date && uuid.safeParse(input.sectionId).success && DATE.test(input.date)) {
    const { data: links } = await supabase.from("diary_entry_sections").select("entry_id").eq("section_id", input.sectionId);
    const mine = new Set((links ?? []).map((l) => l.entry_id));
    const { data } = await supabase.from("diary_entries").select("id").eq("entry_date", input.date).eq("te_status", "pending").is("archived_at", null);
    ids = (data ?? []).map((e) => e.id).filter((id) => mine.has(id));
  }
  if (!ids.length) return { ok: true, done: 0, left: 0, message: "Nothing is waiting for translation." };
  let done = 0;
  let why = "";
  for (const id of ids) {
    const t = await translateDiaryEntry(id);
    if (t.state === "translated") done++;
    else if (t.state === "pending" && t.reason) why = REASON_TEXT[t.reason] ?? t.reason;
  }
  refresh();
  const left = ids.length - done;
  return { ok: true, done, left, message: left ? `${done} translated, ${left} still pending (${why || "try again later, or type the Telugu"}).` : `${done} line(s) translated.` };
}
