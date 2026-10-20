"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireCapability, requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { resolveYear } from "@/lib/settings";
import { friendlyDbError, type ActionState } from "@/lib/utils";
import type { Json, StudentFieldDefinition } from "@/types/database";
import { getSectionOptions, getStudentConfig, getStudentsPage, listStudents, type StudentRow, type StudentsPageParams } from "./queries";
import { requirePage } from "./page-guard";
import { imageSize } from "@/lib/image-size";
import { photoProblem } from "./photo-rules";
import { GENDERS, parseDefinitionValue, PHONE_RE, PIN_RE, validateImportRow, type ImportContext, type RawRow, type StudentPayload, type ValidatedRow } from "./fields";

const uuid = z.string().uuid();
const DOC_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

function ext(file: File) {
  return (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Map a database error to a field (when we can tell) or a general message. */
function saveError(err: { code?: string; message: string }, defs: StudentFieldDefinition[]): ActionState {
  if (err.code === "23505" && /admission_no/.test(err.message)) return { fieldErrors: { "s.admission_no": ["This admission number is already used"] }, error: "This admission number is already used." };
  if (err.code === "23505" && /roll/.test(err.message)) return { fieldErrors: { "e.roll_no": ["Another student in this section has this roll number"] }, error: "Roll number already used in this section." };
  if (err.code === "23514") {
    const def = defs.find((d) => err.message.includes(`"${d.label}"`));
    if (def) return { fieldErrors: { [`${def.sensitive ? "x" : "d"}.${def.key}`]: [err.message.replace(/"/g, "")] }, error: err.message.replace(/"/g, "") };
  }
  return { error: friendlyDbError(err) };
}

// ------------------------------------------------------------------ save (form)
export async function saveStudentForm(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("students.edit");
  const supabase = await createClient();
  const { definitions, docTypes } = await getStudentConfig(supabase);
  const get = (k: string) => (fd.get(k)?.toString() ?? "").trim();
  const fieldErrors: Record<string, string[]> = {};
  const err = (k: string, m: string) => (fieldErrors[k] = [...(fieldErrors[k] ?? []), m]);

  const id = get("id") || undefined;
  if (id && !uuid.safeParse(id).success) return { error: "Invalid student." };

  // core
  if (get("s.full_name").length < 2) err("s.full_name", "Full name is required");
  if (!(GENDERS as readonly string[]).includes(get("s.gender"))) err("s.gender", "Pick a gender");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(get("s.date_of_birth"))) err("s.date_of_birth", "Date of birth is required");
  if (get("s.pincode") && !PIN_RE.test(get("s.pincode"))) err("s.pincode", "Pincode must be 6 digits");
  if (get("e.roll_no") && !/^[1-9][0-9]*$/.test(get("e.roll_no"))) err("e.roll_no", "Whole number");

  // guardians
  const guardians: Record<string, string | boolean | null>[] = [];
  const primary = get("primary_contact") || "father";
  for (const who of ["father", "mother", "guardian"] as const) {
    const name = get(`g.${who}.full_name`);
    const phone = get(`g.${who}.phone`);
    if (phone && !PHONE_RE.test(phone)) err(`g.${who}.phone`, "10-digit mobile number");
    if (!name) {
      if (phone) err(`g.${who}.full_name`, "Name is required when a phone is given");
      continue;
    }
    guardians.push({
      guardian_id: get(`g.${who}.guardian_id`) || null,
      relation: who === "guardian" ? get("g.guardian.relation") || "guardian" : who,
      full_name: name,
      phone: phone || null,
      occupation: get(`g.${who}.occupation`) || null,
      education: get(`g.${who}.education`) || null,
      address: get("s.address") || null,
      pincode: get("s.pincode") || null,
      is_primary: primary === who,
    });
  }
  const sibling = get("sibling_admission_no");
  if (!id && !guardians.length && !sibling) err("g.father.full_name", "Give at least one parent/guardian, or a sibling's admission number");

  // government fields
  const details: Record<string, unknown> = {};
  const secure: Record<string, string> = {};
  for (const def of definitions) {
    if (def.sensitive) {
      const v = get(`x.${def.key}`);
      if (fd.get(`x.${def.key}.clear`) === "on") secure[def.key] = "";
      else if (v) {
        const [, e] = parseDefinitionValue(def, v);
        if (e) err(`x.${def.key}`, e.replace(`${def.label}: `, ""));
        else secure[def.key] = v.replace(/\s/g, "");
      }
      continue;
    }
    const raw = def.field_type === "multiselect" ? fd.getAll(`d.${def.key}`).map(String) : def.field_type === "boolean" ? get(`d.${def.key}`) : get(`d.${def.key}`);
    const [value, e] = parseDefinitionValue(def, raw);
    if (e) err(`d.${def.key}`, e.replace(`${def.label}: `, ""));
    else if (value !== undefined && value !== null) details[def.key] = value;
  }

  // files
  const photo = fd.get("photo");
  let photoDims: { width: number; height: number } | null = null;
  if (photo instanceof File && photo.size > 0) {
    // the photo rules: JPEG or PNG, at least 300 x 400 pixels, at most 5 MB, passport shape (the database checks them again)
    photoDims = imageSize(new Uint8Array(await photo.arrayBuffer()));
    const problem = photoProblem(photoDims?.width, photoDims?.height, photo.size, photo.type);
    if (problem) err("photo", problem);
  }
  const docs: { type: string; file: File }[] = [];
  for (const t of docTypes) {
    const f = fd.get(`doc.${t.code}`);
    if (f instanceof File && f.size > 0) {
      if (!DOC_TYPES.includes(f.type)) err(`doc.${t.code}`, "Use a PDF or an image");
      else if (f.size > 5 * 1024 * 1024) err(`doc.${t.code}`, "Must be under 5 MB");
      else docs.push({ type: t.code, file: f });
    }
  }
  if (Object.keys(fieldErrors).length) return { fieldErrors, error: "Please fix the highlighted fields." };

  const year = await resolveYear(get("e.academic_year_id") || undefined);
  const payload: StudentPayload = {
    id,
    student: {
      admission_no: get("s.admission_no") || null,
      full_name: get("s.full_name"),
      gender: get("s.gender"),
      date_of_birth: get("s.date_of_birth"),
      admission_date: get("s.admission_date") || null,
      address: get("s.address") || null,
      village_town: get("s.village_town") || null,
      district: get("s.district") || null,
      pincode: get("s.pincode") || null,
    },
    enrollment: year && get("e.section_id") ? { academic_year_id: year.id, section_id: get("e.section_id"), roll_no: get("e.roll_no") || null } : undefined,
    guardians,
    sibling_admission_no: sibling || undefined,
    details,
    secure,
  };
  const { data: sid, error } = await supabase.rpc("save_student", { p: payload as unknown as Json });
  if (error || !sid) return saveError(error ?? { message: "Could not save." }, definitions);

  // photo + documents (after the record exists)
  const problems: string[] = [];
  if (photo instanceof File && photo.size > 0) {
    const path = `${sid}/photo-${Date.now()}.${ext(photo)}`;
    const up = await supabase.storage.from("student-photos").upload(path, photo, { contentType: photo.type });
    if (up.error) problems.push("photo");
    else {
      const set = await supabase.rpc("student_photo_set", { p_student: sid, p_path: path, p_w: photoDims?.width ?? 0, p_h: photoDims?.height ?? 0, p_bytes: photo.size, p_mime: photo.type });
      if (set.error) problems.push("photo");
    }
  }
  for (const d of docs) {
    const path = `${sid}/${d.type}-${Date.now()}.${ext(d.file)}`;
    const up = await supabase.storage.from("student-documents").upload(path, d.file, { contentType: d.file.type });
    if (up.error) problems.push(d.type);
    else await supabase.from("student_documents").insert({ student_id: sid, doc_type: d.type, file_path: path, file_name: d.file.name, mime_type: d.file.type, size_bytes: d.file.size });
  }
  revalidatePath("/students", "layout");
  redirect(`/students/${sid}?saved=${problems.length ? "partial" : "1"}`);
}

// ------------------------------------------------------------------ documents
export async function uploadStudentDocument(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("students.edit");
  const studentId = uuid.parse(fd.get("student_id"));
  const docType = String(fd.get("doc_type") ?? "");
  const file = fd.get("file");
  if (!docType) return { fieldErrors: { doc_type: ["Pick a document type"] } };
  if (!(file instanceof File) || file.size === 0) return { fieldErrors: { file: ["Choose a file"] } };
  if (!DOC_TYPES.includes(file.type)) return { fieldErrors: { file: ["Use a PDF or an image"] } };
  if (file.size > 5 * 1024 * 1024) return { fieldErrors: { file: ["Must be under 5 MB"] } };
  const supabase = await createClient();
  const path = `${studentId}/${docType}-${Date.now()}.${ext(file)}`;
  const up = await supabase.storage.from("student-documents").upload(path, file, { contentType: file.type });
  if (up.error) return { error: up.error.message };
  const { error } = await supabase.from("student_documents").insert({ student_id: studentId, doc_type: docType, file_path: path, file_name: file.name, mime_type: file.type, size_bytes: file.size });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath(`/students/${studentId}`);
  return { ok: true, message: "Document uploaded." };
}

/** Short-lived (60 s) signed link; RLS + storage policies decide who may. */
export async function documentLink(documentId: string): Promise<{ url?: string; error?: string }> {
  await requireStaff();
  const supabase = await createClient();
  const { data: doc } = await supabase.from("student_documents").select("file_path, student_id, doc_type").eq("id", uuid.parse(documentId)).maybeSingle();
  if (!doc) return { error: "Not allowed." };
  const { data, error } = await supabase.storage.from("student-documents").createSignedUrl(doc.file_path, 60);
  if (error || !data) return { error: "Could not open the document." };
  await supabase.rpc("log_event", { p_action: "student.document_opened", p_table: "students", p_record_id: doc.student_id, p_details: { doc_type: doc.doc_type } });
  return { url: data.signedUrl };
}

export async function deleteStudentDocument(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("records.delete");
  const supabase = await createClient();
  const { data: doc } = await supabase.from("student_documents").select("id, file_path, student_id").eq("id", uuid.parse(fd.get("id"))).maybeSingle();
  if (!doc) return { error: "Document not found." };
  const { error } = await supabase.from("student_documents").delete().eq("id", doc.id);
  if (error) return { error: friendlyDbError(error) };
  await supabase.storage.from("student-documents").remove([doc.file_path]);
  revalidatePath(`/students/${doc.student_id}`);
  return { ok: true, message: "Document deleted." };
}

// ------------------------------------------------------------------ IDs
export async function revealStudentIds(studentId: string): Promise<{ values?: { label: string; value: string }[]; error?: string }> {
  const me = await requireStaff();
  if (!can(me, "students.govIdView")) return { error: "You don't have access to full ID numbers." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reveal_student_secure_values", { p_student_id: uuid.parse(studentId) });
  if (error) return { error: error.code === "42501" ? "You don't have access to full ID numbers." : friendlyDbError(error) };
  return { values: (data ?? []).map((d) => ({ label: d.label, value: d.value.replace(/(\d{4})(?=\d)/g, "$1 ") })) };
}

// ------------------------------------------------------------------ status (Admin)
const statusSchema = z.object({
  id: uuid,
  status: z.enum(["active", "left", "tc_issued", "passed_out"]),
  status_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
  status_reason: z.string().trim().max(300).optional(),
});
export async function setStudentStatus(_: ActionState, fd: FormData): Promise<ActionState> {
  await requireCapability("students.status");
  const parsed = statusSchema.safeParse(Object.fromEntries(fd));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors, error: "Please check the fields." };
  const { id, status, status_date, status_reason } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase
    .from("students")
    .update({ status, status_date: status === "active" ? null : status_date || new Date().toISOString().slice(0, 10), status_reason: status === "active" ? null : status_reason || null })
    .eq("id", id);
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/students", "layout");
  return { ok: true, message: "Status updated." };
}

// ------------------------------------------------------------------ bulk section change
export async function changeStudentsSection(ids: string[], sectionId: string): Promise<ActionState> {
  await requireCapability("students.edit");
  const parsed = z.object({ ids: z.array(uuid).min(1).max(1000), sectionId: uuid }).safeParse({ ids, sectionId });
  if (!parsed.success) return { error: "Pick students and a section." };
  const supabase = await createClient();
  const { data: section } = await supabase.from("sections").select("academic_year_id").eq("id", sectionId).maybeSingle();
  if (!section) return { error: "Section not found." };
  const { error } = await supabase
    .from("student_enrollments")
    .upsert(parsed.data.ids.map((student_id) => ({ student_id, academic_year_id: section.academic_year_id, section_id: sectionId, roll_no: null })), {
      onConflict: "student_id,academic_year_id",
    });
  if (error) return { error: friendlyDbError(error) };
  revalidatePath("/students", "layout");
  return { ok: true, message: `Moved ${parsed.data.ids.length} student(s). Roll numbers were cleared for them.` };
}

// ------------------------------------------------------------------ import
async function importContext(): Promise<ImportContext & { existing: Set<string> }> {
  const supabase = await createClient();
  const year = await resolveYear();
  if (!year) throw new Error("No current academic year.");
  const [sections, { definitions }] = await Promise.all([getSectionOptions(supabase, year.id), getStudentConfig(supabase)]);
  const existing = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from("students").select("admission_no").range(from, from + 999);
    (data ?? []).forEach((r) => existing.add(r.admission_no));
    if (!data || data.length < 1000) break;
  }
  return {
    yearId: year.id,
    sections: Object.fromEntries(sections.map((s) => [`${s.className.toLowerCase()}|${s.section.toLowerCase()}`, s.id])),
    definitions,
    existing,
  };
}

export type ImportCheck = ValidatedRow & { status: "ok" | "error" | "exists" };

function checkRows(rows: RawRow[], ctx: Awaited<ReturnType<typeof importContext>>): ImportCheck[] {
  const seen = new Map<string, number>();
  return rows.map((raw, i) => {
    const v = validateImportRow(raw, i + 2, ctx); // +2: header row, 1-based
    if (v.admissionNo) {
      if (seen.has(v.admissionNo)) v.errors.push(`Admission no repeats row ${seen.get(v.admissionNo)}`);
      else seen.set(v.admissionNo, v.rowNo);
    }
    const status: ImportCheck["status"] = v.errors.length ? "error" : ctx.existing.has(v.admissionNo) ? "exists" : "ok";
    return { ...v, payload: v.errors.length ? null : v.payload, status };
  });
}

/** Step 2: validate every row; nothing is saved. */
export async function validateImport(rows: RawRow[]): Promise<{ rows?: ImportCheck[]; error?: string }> {
  await requireCapability("students.edit");
  if (!Array.isArray(rows) || rows.length === 0) return { error: "The file has no student rows." };
  if (rows.length > 2000) return { error: "Import at most 2000 rows at a time." };
  try {
    return { rows: checkRows(rows, await importContext()) };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Could not check the file." };
  }
}

/**
 * Step 3: save valid rows. Rows whose admission no already exists are skipped,
 * so re-running the same file never creates duplicates. Each row is saved
 * atomically (save_student), so a failing row never leaves half a student.
 */
export async function commitImport(rows: RawRow[]): Promise<{ results?: { rowNo: number; admissionNo: string; outcome: "imported" | "skipped" | "failed"; message?: string }[]; error?: string }> {
  await requireCapability("students.edit");
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 2000) return { error: "Nothing to import." };
  const ctx = await importContext();
  const checked = checkRows(rows, ctx);
  const supabase = await createClient();
  const results: NonNullable<Awaited<ReturnType<typeof commitImport>>["results"]> = [];
  for (const r of checked) {
    if (r.status === "error") {
      results.push({ rowNo: r.rowNo, admissionNo: r.admissionNo, outcome: "failed", message: r.errors.join("; ") });
      continue;
    }
    if (r.status === "exists") {
      results.push({ rowNo: r.rowNo, admissionNo: r.admissionNo, outcome: "skipped", message: "Already exists" });
      continue;
    }
    const { error } = await supabase.rpc("save_student", { p: r.payload as unknown as Json });
    if (error) results.push({ rowNo: r.rowNo, admissionNo: r.admissionNo, outcome: error.code === "23505" ? "skipped" : "failed", message: error.code === "23505" ? "Already exists" : error.message.replace(/"/g, "") });
    else results.push({ rowNo: r.rowNo, admissionNo: r.admissionNo, outcome: "imported" });
  }
  const summary = { imported: results.filter((r) => r.outcome === "imported").length, skipped: results.filter((r) => r.outcome === "skipped").length, failed: results.filter((r) => r.outcome === "failed").length };
  await supabase.rpc("log_event", { p_action: "student.import", p_table: "students", p_details: { rows: rows.length, ...summary } });
  revalidatePath("/students", "layout");
  return { results };
}

// ------------------------------------------------------------------ government export (Admin)
export async function governmentExportRows(input: { studentIds: string[]; includeFullIds: boolean; filters?: { class?: string; section?: string; status?: string } }): Promise<{ headers?: string[]; rows?: (string | number | boolean | null)[][]; error?: string }> {
  await requireCapability("students.govExport");
  const ids = z.array(uuid).max(5000).parse(input.studentIds);
  if (!ids.length) return { error: "No students to export." };
  const supabase = await createClient();
  const { definitions } = await getStudentConfig(supabase);
  const year = await resolveYear();
  if (!year) return { error: "No current academic year." };
  const me = await requireStaff();
  const all = await listStudents(me, year.id, "all");
  const chosen = all.filter((s) => ids.includes(s.id));

  let full = new Map<string, Record<string, string>>();
  if (input.includeFullIds) {
    const { data, error } = await supabase.rpc("export_student_ids", { p_ids: chosen.map((s) => s.id) });
    if (error) return { error: friendlyDbError(error) };
    full = new Map();
    for (const r of data ?? []) full.set(r.student_id, { ...(full.get(r.student_id) ?? {}), [r.field_key]: r.value });
  }
  const g = (s: (typeof chosen)[number], rel: string) => s.guardians.find((x) => x.relation === rel);
  const headers = [
    "Admission no", "Student name", "Gender", "Date of birth", "Admission date", "Class", "Section", "Roll no",
    "Father name", "Father mobile", "Father occupation", "Mother name", "Mother mobile", "Mother occupation", "Primary mobile",
    "Address", "Village / town", "District", "Pincode", "Status",
    ...definitions.map((d) => (d.sensitive ? `${d.label}${input.includeFullIds ? "" : " (masked)"}` : d.label)),
  ];
  const rows = chosen.map((s) => [
    s.admission_no, s.full_name, s.gender, s.date_of_birth, s.admission_date, s.className, s.section, s.rollNo,
    g(s, "father")?.name ?? null, g(s, "father")?.phone ?? null, g(s, "father")?.occupation ?? null,
    g(s, "mother")?.name ?? null, g(s, "mother")?.phone ?? null, g(s, "mother")?.occupation ?? null, s.primaryPhone,
    s.address, s.village_town, s.district, s.pincode, s.status,
    ...definitions.map((d) => {
      if (d.sensitive) return input.includeFullIds ? (full.get(s.id)?.[d.key] ?? null) : s.masked?.[d.key] ? `XXXX XXXX ${s.masked[d.key]}` : null;
      const v = s.details?.[d.key];
      return Array.isArray(v) ? v.join("; ") : typeof v === "boolean" ? (v ? "Yes" : "No") : ((v as string | number | null | undefined) ?? null);
    }),
  ]);
  // the same audit entry as every other report export: who, when, which filters, how many rows. Never an ID number.
  const f = input.filters ?? {};
  await supabase.rpc("log_report", {
    p_report: "government-export",
    p_format: "xlsx",
    p_filters: { class: String(f.class ?? "All classes").slice(0, 60), section: String(f.section ?? "All sections").slice(0, 60), status: String(f.status ?? "All").slice(0, 20), full_ids: input.includeFullIds },
    p_rows: rows.length,
  });
  return { headers, rows };
}



// ------------------------------------------------------------------ export of a whole filtered list
/** Every student that matches the list's search and filters (not just the page on screen), for the export dialog. */
export async function studentsForExport(params: StudentsPageParams, mode: "all" | "mine"): Promise<{ rows?: StudentRow[]; error?: string }> {
  await requirePage(mode === "mine" ? "/my/students" : "/students");
  const year = await resolveYear();
  if (!year) return { rows: [] };
  if (params.ids) z.array(uuid).max(1000).parse(params.ids);
  const out: StudentRow[] = [];
  for (let page = 0; page < 10; page++) {
    const r = await getStudentsPage(year.id, { ...params, page, size: 250, full: true }, mode);
    out.push(...r.rows);
    if (out.length >= r.total || r.rows.length < 250) break;
  }
  return { rows: out };
}
