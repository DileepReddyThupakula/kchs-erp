import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { CurrentStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { getMyClasses } from "@/features/my/queries";
import type { Guardian, StudentDocumentType, StudentFieldDefinition } from "@/types/database";
import { missingGovFields } from "./fields";

type Supa = Awaited<ReturnType<typeof createClient>>;

/** Read every row of a query in pages (PostgREST returns at most 1000 per call). */
async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

export type SectionOption = { id: string; label: string; classId: string; className: string; classOrder: number; section: string };

export async function getSectionOptions(supabase: Supa, yearId: string): Promise<SectionOption[]> {
  const [{ data: sections }, { data: classes }] = await Promise.all([
    supabase.from("sections").select("id, name, class_id").eq("academic_year_id", yearId),
    supabase.from("classes").select("id, name, sort_order"),
  ]);
  const cls = new Map((classes ?? []).map((c) => [c.id, c]));
  return (sections ?? [])
    .map((s) => ({
      id: s.id,
      classId: s.class_id,
      className: cls.get(s.class_id)?.name ?? "—",
      classOrder: cls.get(s.class_id)?.sort_order ?? 0,
      section: s.name,
      label: `${cls.get(s.class_id)?.name ?? "—"} – ${s.name}`,
    }))
    .sort((a, b) => a.classOrder - b.classOrder || a.section.localeCompare(b.section));
}

export async function getStudentConfig(supabase: Supa) {
  const [{ data: defs }, { data: docTypes }] = await Promise.all([
    supabase.from("student_field_definitions").select("*").eq("is_active", true).order("sort_order"),
    supabase.from("student_document_types").select("*").eq("is_active", true).order("sort_order"),
  ]);
  return { definitions: (defs ?? []) as StudentFieldDefinition[], docTypes: (docTypes ?? []) as StudentDocumentType[] };
}

export type StudentRow = {
  id: string;
  admission_no: string;
  full_name: string;
  gender: string;
  date_of_birth: string;
  admission_date: string;
  status: string;
  address: string | null;
  village_town: string | null;
  district: string | null;
  pincode: string | null;
  sectionId: string | null;
  classId: string | null;
  className: string | null;
  classOrder: number;
  section: string | null;
  rollNo: number | null;
  guardians: { relation: string; name: string; phone: string | null; occupation: string | null; isPrimary: boolean }[];
  primaryPhone: string | null;
  /** Only for Admin / student_records: */
  details?: Record<string, unknown>;
  masked?: Record<string, string>;
  missingDocs?: string[];
  missingGov?: string[];
};

/**
 * Students for a list. mode "all" (Admin / student_records): every student,
 * with government fields, masked IDs and document gaps. mode "mine": only
 * students enrolled this year in the teacher's own sections (scope rule),
 * basic fields only — even if a duty would let the database return more.
 */
export async function listStudents(me: CurrentStaff, yearId: string, mode: "all" | "mine"): Promise<StudentRow[]> {
  const supabase = await createClient();
  const manage = mode === "all" && can(me, "students.edit");
  const sections = await getSectionOptions(supabase, yearId);
  const sectionById = new Map(sections.map((s) => [s.id, s]));
  const mySections = mode === "mine" ? new Set((await getMyClasses(me, yearId)).map((c) => c.sectionId)) : null;

  const enrollments = await fetchAll((f, t) =>
    supabase.from("student_enrollments").select("student_id, section_id, roll_no").eq("academic_year_id", yearId).range(f, t),
  );
  const enrolByStudent = new Map(enrollments.filter((e) => !mySections || mySections.has(e.section_id)).map((e) => [e.student_id, e]));

  const students = await fetchAll((f, t) =>
    supabase
      .from("students")
      .select("id, admission_no, full_name, gender, date_of_birth, admission_date, status, address, village_town, district, pincode")
      .order("full_name")
      .range(f, t),
  );
  const visible = mySections ? students.filter((s) => enrolByStudent.has(s.id)) : students;
  const ids = new Set(visible.map((s) => s.id));

  const [links, guardians] = await Promise.all([
    fetchAll((f, t) => supabase.from("student_guardians").select("student_id, guardian_id, relation, is_primary").range(f, t)),
    fetchAll<Pick<Guardian, "id" | "full_name" | "phone" | "occupation">>((f, t) => supabase.from("guardians").select("id, full_name, phone, occupation").range(f, t)),
  ]);
  const guardianById = new Map(guardians.map((g) => [g.id, g]));
  const guardiansOf = new Map<string, StudentRow["guardians"]>();
  for (const l of links) {
    if (!ids.has(l.student_id)) continue;
    const g = guardianById.get(l.guardian_id);
    if (!g) continue;
    const list = guardiansOf.get(l.student_id) ?? [];
    list.push({ relation: l.relation, name: g.full_name, phone: g.phone, occupation: g.occupation, isPrimary: l.is_primary });
    guardiansOf.set(l.student_id, list);
  }

  let extra: { details: Map<string, Record<string, unknown>>; masked: Map<string, Record<string, string>>; docs: Map<string, Set<string>>; defs: StudentFieldDefinition[]; requiredDocs: { code: string; label: string }[] } | null = null;
  if (manage) {
    const [{ definitions, docTypes }, profiles, secure, docs] = await Promise.all([
      getStudentConfig(supabase),
      fetchAll((f, t) => supabase.from("student_profiles").select("student_id, details").range(f, t)),
      fetchAll((f, t) => supabase.from("student_secure_values").select("student_id, field_key, value_last4").range(f, t)),
      fetchAll((f, t) => supabase.from("student_documents").select("student_id, doc_type").range(f, t)),
    ]);
    const masked = new Map<string, Record<string, string>>();
    for (const s of secure) masked.set(s.student_id, { ...(masked.get(s.student_id) ?? {}), [s.field_key]: s.value_last4 });
    const docMap = new Map<string, Set<string>>();
    for (const d of docs) docMap.set(d.student_id, (docMap.get(d.student_id) ?? new Set()).add(d.doc_type));
    extra = {
      details: new Map(profiles.map((p) => [p.student_id, (p.details ?? {}) as Record<string, unknown>])),
      masked,
      docs: docMap,
      defs: definitions,
      requiredDocs: docTypes.filter((d) => d.required).map((d) => ({ code: d.code, label: d.label })),
    };
  }

  return visible.map((s) => {
    const e = enrolByStudent.get(s.id);
    const sec = e ? sectionById.get(e.section_id) : undefined;
    const gs = (guardiansOf.get(s.id) ?? []).sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary));
    const row: StudentRow = {
      ...s,
      sectionId: sec?.id ?? null,
      classId: sec?.classId ?? null,
      className: sec?.className ?? null,
      classOrder: sec?.classOrder ?? 999,
      section: sec?.section ?? null,
      rollNo: e?.roll_no ?? null,
      guardians: gs,
      primaryPhone: gs.find((g) => g.phone)?.phone ?? null,
    };
    if (extra) {
      const details = extra.details.get(s.id) ?? {};
      const masked = extra.masked.get(s.id) ?? {};
      const have = extra.docs.get(s.id) ?? new Set<string>();
      row.details = details;
      row.masked = masked;
      row.missingDocs = extra.requiredDocs.filter((d) => !have.has(d.code)).map((d) => d.label);
      row.missingGov = missingGovFields(extra.defs, details, new Set(Object.keys(masked)));
    }
    return row;
  });
}

/** Active students per section for a year (RLS-scoped for teachers). */
export async function studentCountsBySection(supabase: Supa, yearId: string) {
  const rows = await fetchAll((f, t) =>
    supabase.from("student_enrollments").select("section_id, students!inner(status)").eq("academic_year_id", yearId).eq("students.status", "active").range(f, t),
  );
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.section_id, (counts.get(r.section_id) ?? 0) + 1);
  return counts;
}

export async function getStudentProfile(id: string) {
  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, admission_no, full_name, gender, date_of_birth, admission_date, address, village_town, district, pincode, photo_path, status, status_date, status_reason, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (!student) return null;

  const [{ data: enrolments }, { data: links }, { data: profile }, { data: masked }, { data: documents }] = await Promise.all([
    supabase.from("student_enrollments").select("id, academic_year_id, section_id, roll_no, status").eq("student_id", id),
    supabase.from("student_guardians").select("guardian_id, relation, is_primary").eq("student_id", id),
    supabase.from("student_profiles").select("details").eq("student_id", id).maybeSingle(),
    supabase.from("student_secure_values").select("field_key, value_last4").eq("student_id", id),
    supabase.from("student_documents").select("*").eq("student_id", id).order("created_at"),
  ]);

  const guardianIds = (links ?? []).map((l) => l.guardian_id);
  const [{ data: guardians }, { data: siblingLinks }, { data: years }] = await Promise.all([
    guardianIds.length ? supabase.from("guardians").select("*").in("id", guardianIds) : Promise.resolve({ data: [] as Guardian[] }),
    guardianIds.length
      ? supabase.from("student_guardians").select("student_id").in("guardian_id", guardianIds).neq("student_id", id)
      : Promise.resolve({ data: [] as { student_id: string }[] }),
    supabase.from("academic_years").select("id, name, start_date, is_current"),
  ]);
  const siblingIds = [...new Set((siblingLinks ?? []).map((s) => s.student_id))];
  const { data: siblings } = siblingIds.length
    ? await supabase.from("students").select("id, admission_no, full_name, status").in("id", siblingIds)
    : { data: [] };

  const sectionIds = [...new Set((enrolments ?? []).map((e) => e.section_id))];
  const { data: secs } = sectionIds.length ? await supabase.from("sections").select("id, name, class_id").in("id", sectionIds) : { data: [] };
  const classIds = [...new Set((secs ?? []).map((s) => s.class_id))];
  const { data: classes } = classIds.length ? await supabase.from("classes").select("id, name").in("id", classIds) : { data: [] };
  const className = new Map((classes ?? []).map((c) => [c.id, c.name]));
  const yearById = new Map((years ?? []).map((y) => [y.id, y]));
  const history = (enrolments ?? [])
    .map((e) => {
      const sec = (secs ?? []).find((s) => s.id === e.section_id);
      const y = yearById.get(e.academic_year_id);
      return { ...e, yearName: y?.name ?? "—", yearStart: y?.start_date ?? "", isCurrent: !!y?.is_current, classLabel: sec ? `${className.get(sec.class_id) ?? "—"} – ${sec.name}` : "— (not visible)" };
    })
    .sort((a, b) => b.yearStart.localeCompare(a.yearStart));

  let photoUrl: string | null = null;
  if (student.photo_path) {
    const { data } = await supabase.storage.from("student-photos").createSignedUrl(student.photo_path, 600);
    photoUrl = data?.signedUrl ?? null;
  }

  return {
    student,
    photoUrl,
    current: history.find((h) => h.isCurrent) ?? null,
    history,
    guardians: (links ?? [])
      .map((l) => ({ ...l, guardian: (guardians ?? []).find((g) => g.id === l.guardian_id) }))
      .filter((l): l is typeof l & { guardian: Guardian } => !!l.guardian)
      .sort((a, b) => Number(b.is_primary) - Number(a.is_primary)),
    siblings: siblings ?? [],
    details: (profile?.details ?? null) as Record<string, unknown> | null,
    masked: Object.fromEntries((masked ?? []).map((m) => [m.field_key, m.value_last4])) as Record<string, string>,
    documents: documents ?? [],
  };
}
export type StudentProfileData = NonNullable<Awaited<ReturnType<typeof getStudentProfile>>>;
