import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import type { NoticeRow } from "@/types/database";

type Supa = Awaited<ReturnType<typeof createClient>>;

export type FileLink = { id: string; name: string; mime: string; size: number; url: string | null };

/** Short-lived (5 minute) links to private files. */
export async function signedLinks(supabase: Supa, bucket: "diary-files" | "notice-files", files: { id: string; file_name: string; mime_type: string; size_bytes: number; file_path: string }[]): Promise<FileLink[]> {
  if (!files.length) return [];
  const { data } = await supabase.storage.from(bucket).createSignedUrls(files.map((f) => f.file_path), 300);
  const byPath = new Map((data ?? []).map((d) => [d.path, d.signedUrl]));
  return files.map((f) => ({ id: f.id, name: f.file_name, mime: f.mime_type, size: f.size_bytes, url: byPath.get(f.file_path) ?? null }));
}

export type DiaryRow = {
  id: string;
  date: string;
  subjectId: string | null;
  subject: string | null;
  body: string;
  status: "draft" | "published";
  archived: boolean;
  sectionIds: string[];
  sections: string; // "Class 6 – A, Class 6 – B"
  classIds: string[];
  createdBy: string;
};

export async function getDiaryRows(
  supabase: Supa,
  opts: { from: string; to: string; sectionLabels: Map<string, { label: string; classId: string }>; subjects: Record<string, string>; names: Map<string, string> },
): Promise<DiaryRow[]> {
  const entries = await fetchAll((f, t) =>
    supabase
      .from("diary_entries")
      .select("id, entry_date, subject_id, body, status, archived_at, created_by")
      .gte("entry_date", opts.from)
      .lte("entry_date", opts.to)
      .order("entry_date", { ascending: false })
      .range(f, t),
  );
  if (!entries.length) return [];
  const links: { entry_id: string; section_id: string }[] = [];
  for (let i = 0; i < entries.length; i += 200) {
    const { data } = await supabase.from("diary_entry_sections").select("entry_id, section_id").in("entry_id", entries.slice(i, i + 200).map((e) => e.id));
    links.push(...(data ?? []));
  }
  const bySection = new Map<string, string[]>();
  for (const l of links) (bySection.get(l.entry_id) ?? bySection.set(l.entry_id, []).get(l.entry_id)!).push(l.section_id);
  return entries.map((e) => {
    const ids = bySection.get(e.id) ?? [];
    const labels = ids.map((id) => opts.sectionLabels.get(id)).filter(Boolean) as { label: string; classId: string }[];
    return {
      id: e.id,
      date: e.entry_date,
      subjectId: e.subject_id,
      subject: e.subject_id ? (opts.subjects[e.subject_id] ?? null) : null,
      body: e.body,
      status: e.status,
      archived: !!e.archived_at,
      sectionIds: ids,
      sections: labels.map((l) => l.label).sort().join(", "),
      classIds: [...new Set(labels.map((l) => l.classId))],
      createdBy: e.created_by ? (opts.names.get(e.created_by) ?? "") : "",
    };
  });
}

export type NoticeListRow = NoticeRow & { audienceText: string; readCount: number | null; total: number | null; iRead: boolean };

export async function getAudienceText(supabase: Supa, notices: { id: string; audience: string }[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = notices.filter((n) => n.audience !== "all").map((n) => n.id);
  const [{ data: rows }, { data: classes }, { data: dir }] = await Promise.all([
    ids.length ? supabase.from("notice_audience").select("notice_id, role, class_id, staff_id").in("notice_id", ids) : Promise.resolve({ data: [] }),
    supabase.from("classes").select("id, name"),
    supabase.rpc("staff_directory"),
  ]);
  const cn = new Map((classes ?? []).map((c) => [c.id, c.name]));
  const sn = new Map((dir ?? []).map((s) => [s.id, s.full_name]));
  for (const n of notices) {
    if (n.audience === "all") {
      out.set(n.id, "All staff");
      continue;
    }
    const mine = (rows ?? []).filter((r) => r.notice_id === n.id);
    if (n.audience === "roles") out.set(n.id, mine.map((r) => (r.role === "teacher" ? "Teachers" : r.role === "admin" ? "Admin" : "Staff")).join(", "));
    else if (n.audience === "classes") out.set(n.id, "Teachers of " + mine.map((r) => cn.get(r.class_id ?? "") ?? "a class").join(", "));
    else out.set(n.id, mine.map((r) => sn.get(r.staff_id ?? "") ?? "a teacher").join(", "));
  }
  return out;
}

/** Subject id -> name. Uses subject_names() (so a class teacher sees every subject's name); falls back to the scope-checked table. */
export async function getSubjectNameMap(supabase: Supa): Promise<Record<string, string>> {
  const r = await supabase.rpc("subject_names");
  if (!r.error) return Object.fromEntries((r.data ?? []).map((s) => [s.id, s.name]));
  const { data } = await supabase.from("subjects").select("id, name");
  return Object.fromEntries((data ?? []).map((s) => [s.id, s.name]));
}
