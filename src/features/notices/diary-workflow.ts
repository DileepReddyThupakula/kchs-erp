import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import type { CurrentStaff } from "@/lib/auth/session";
import { diaryIsLate, type DiaryStatus } from "./shared";
import { signedLinks, type FileLink } from "./queries";
import { getSectionsInfo } from "@/features/timetable/queries";

type Supa = Awaited<ReturnType<typeof createClient>>;
type Section = Awaited<ReturnType<typeof getSectionsInfo>>[number];

export function nowHmIst() {
  return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });
}

// ------------------------------------------------------------------ Admin / duty: the board
export type BoardState = "none" | "waiting" | "ready" | "published";
export type BoardRow = { sectionId: string; label: string; classId: string; className: string; expected: number; submitted: number; published: number; pending: number; skipped: number; state: BoardState; late: boolean };

export async function getBoard(supabase: Supa, sections: Section[], date: string, today: string, deadline: string): Promise<BoardRow[]> {
  const { data } = await supabase.rpc("diary_board", { p_date: date });
  const byId = new Map((data ?? []).map((r) => [r.section_id, r]));
  const hm = nowHmIst();
  return sections.map((s) => {
    const r = byId.get(s.id) ?? { expected: 0, submitted: 0, published: 0, pending: 0, skipped: 0 };
    const complete = r.expected > 0 && r.submitted >= r.expected;
    const state: BoardState = r.published > 0 && r.pending === 0 ? "published" : r.pending > 0 && (complete || r.expected === 0) ? "ready" : r.expected === 0 && r.published + r.pending === 0 ? "none" : "waiting";
    return {
      sectionId: s.id,
      label: s.label,
      classId: s.classId,
      className: s.className,
      expected: r.expected,
      submitted: r.submitted,
      published: r.published,
      pending: r.pending,
      skipped: r.skipped,
      state,
      late: diaryIsLate({ date, today, nowHm: hm, deadline, complete, expected: r.expected }) && state !== "published",
    };
  });
}

// ------------------------------------------------------------------ Admin / duty: one class, one day
export type TeStatus = "none" | "pending" | "auto" | "reviewed";
export type EntryInfo = { id: string; body: string; bodyTe: string; teStatus: TeStatus; status: DiaryStatus; authorName: string; files: FileLink[] };
export type ClassLine = { key: string; subjectId: string | null; subject: string | null; subjectTe: string | null; kind: "subject" | "remark"; period: number | null; teachers: string; skipped: boolean; expected: boolean; entry: EntryInfo | null };

export async function getClassDay(supabase: Supa, sectionId: string, date: string, subjects: Record<string, string>, subjectsTe: Record<string, string> = {}): Promise<ClassLine[]> {
  const [{ data: plan }, { data: links }, { data: dir }] = await Promise.all([
    supabase.rpc("diary_class_plan", { p_section: sectionId, p_date: date }),
    supabase.from("diary_entry_sections").select("entry_id").eq("section_id", sectionId),
    supabase.rpc("staff_directory"),
  ]);
  const names = new Map((dir ?? []).map((s) => [s.id, s.full_name]));
  const inSection = new Set((links ?? []).map((l) => l.entry_id));
  const entries = (await fetchAll((f, t) => supabase.from("diary_entries").select("id, subject_id, kind, body, body_te, te_status, status, author_id, created_by").eq("entry_date", date).is("archived_at", null).range(f, t))).filter((e) => inSection.has(e.id));
  const { data: att } = entries.length ? await supabase.from("diary_attachments").select("id, entry_id, file_path, file_name, mime_type, size_bytes").in("entry_id", entries.map((e) => e.id)) : { data: [] };
  const links2 = await signedLinks(supabase, "diary-files", att ?? []);
  const files = new Map<string, FileLink[]>();
  (att ?? []).forEach((a, i) => (files.get(a.entry_id) ?? files.set(a.entry_id, []).get(a.entry_id)!).push(links2[i]));
  const info = (e: (typeof entries)[number]): EntryInfo => ({ id: e.id, body: e.body, bodyTe: e.body_te ?? "", teStatus: e.te_status, status: e.status, authorName: names.get(e.author_id ?? e.created_by ?? "") ?? "", files: files.get(e.id) ?? [] });

  const lines: ClassLine[] = [];
  const seen = new Set<string>();
  for (const p of plan ?? []) {
    const e = entries.find((x) => x.kind === "subject" && x.subject_id === p.subject_id);
    seen.add(p.subject_id);
    lines.push({ key: p.subject_id, subjectId: p.subject_id, subject: subjects[p.subject_id] ?? "Subject", subjectTe: subjectsTe[p.subject_id] ?? null, kind: "subject", period: p.first_period, teachers: p.teachers ?? "", skipped: p.skipped, expected: !p.skipped, entry: e ? info(e) : null });
  }
  for (const e of entries.filter((x) => x.kind === "subject" && x.subject_id && !seen.has(x.subject_id))) {
    lines.push({ key: e.subject_id!, subjectId: e.subject_id, subject: subjects[e.subject_id!] ?? "Subject", subjectTe: subjectsTe[e.subject_id!] ?? null, kind: "subject", period: null, teachers: "", skipped: false, expected: false, entry: info(e) });
  }
  const remark = entries.find((x) => x.kind === "remark");
  lines.push({ key: "remark", subjectId: null, subject: null, subjectTe: null, kind: "remark", period: null, teachers: "", skipped: false, expected: false, entry: remark ? info(remark) : null });
  return lines;
}

// ------------------------------------------------------------------ Teacher: submit
export type SubmitCard = {
  key: string;
  sectionId: string;
  sectionLabel: string;
  subjectId: string | null;
  subjectName: string | null;
  kind: "subject" | "remark";
  entryId: string | null;
  status: "new" | DiaryStatus;
  body: string;
  bodyTe: string;
  files: FileLink[];
  reminded: boolean;
  /** published by someone else / already published: read-only */
  locked: boolean;
};

export async function getSubmitCards(supabase: Supa, me: CurrentStaff, sections: Section[], subjects: Record<string, string>, date: string): Promise<SubmitCard[]> {
  const [{ data: mine }, { data: reminders }, { data: links }] = await Promise.all([
    supabase.from("teacher_assignments").select("section_id, subject_id").eq("staff_id", me.staffId),
    supabase.rpc("my_diary_reminders"),
    supabase.from("diary_entry_sections").select("entry_id, section_id"),
  ]);
  const sectionOf = new Map<string, string>();
  (links ?? []).forEach((l) => sectionOf.set(l.entry_id, l.section_id));
  const entries = (await fetchAll((f, t) => supabase.from("diary_entries").select("id, subject_id, kind, body, body_te, status, author_id").eq("entry_date", date).is("archived_at", null).range(f, t))).filter(
    (e) => e.author_id === me.staffId || e.status === "published",
  );
  const { data: att } = entries.length ? await supabase.from("diary_attachments").select("id, entry_id, file_path, file_name, mime_type, size_bytes").in("entry_id", entries.map((e) => e.id)) : { data: [] };
  const fl = await signedLinks(supabase, "diary-files", att ?? []);
  const files = new Map<string, FileLink[]>();
  (att ?? []).forEach((a, i) => (files.get(a.entry_id) ?? files.set(a.entry_id, []).get(a.entry_id)!).push(fl[i]));
  const sec = new Map(sections.map((s) => [s.id, s]));
  const remind = new Set((reminders ?? []).filter((r) => r.entry_date === date).map((r) => `${r.section_id}:${r.subject_id ?? "remark"}`));

  const cards: SubmitCard[] = [];
  const make = (sectionId: string, subjectId: string | null): SubmitCard | null => {
    const s = sec.get(sectionId);
    if (!s) return null;
    const e = entries.find((x) => sectionOf.get(x.id) === sectionId && (subjectId ? x.kind === "subject" && x.subject_id === subjectId : x.kind === "remark"));
    const key = `${sectionId}:${subjectId ?? "remark"}`;
    return {
      key,
      sectionId,
      sectionLabel: s.label,
      subjectId,
      subjectName: subjectId ? (subjects[subjectId] ?? "Subject") : null,
      kind: subjectId ? "subject" : "remark",
      entryId: e?.id ?? null,
      status: e ? e.status : "new",
      body: e?.body ?? "",
      bodyTe: e?.body_te ?? "",
      files: e ? (files.get(e.id) ?? []) : [],
      reminded: remind.has(key),
      locked: !!e && e.status === "published",
    };
  };
  for (const a of mine ?? []) {
    const c = make(a.section_id, a.subject_id);
    if (c) cards.push(c);
  }
  for (const s of sections.filter((x) => x.classTeacherId === me.staffId)) {
    const c = make(s.id, null);
    if (c) cards.push(c);
  }
  const order = new Map(sections.map((s, i) => [s.id, i]));
  return cards.sort((a, b) => (order.get(a.sectionId)! - order.get(b.sectionId)!) || (a.subjectName ?? "~").localeCompare(b.subjectName ?? "~"));
}

export type MySubmission = { id: string; date: string; sectionLabel: string; subject: string; status: DiaryStatus; body: string };

export async function getMySubmissions(supabase: Supa, me: CurrentStaff, sections: Section[], subjects: Record<string, string>, from: string, to: string): Promise<MySubmission[]> {
  const entries = await fetchAll((f, t) =>
    supabase.from("diary_entries").select("id, entry_date, subject_id, kind, body, status").eq("author_id", me.staffId).is("archived_at", null).gte("entry_date", from).lte("entry_date", to).order("entry_date", { ascending: false }).range(f, t),
  );
  if (!entries.length) return [];
  const { data: links } = await supabase.from("diary_entry_sections").select("entry_id, section_id").in("entry_id", entries.map((e) => e.id));
  const secOf = new Map((links ?? []).map((l) => [l.entry_id, l.section_id]));
  const label = new Map(sections.map((s) => [s.id, s.label]));
  return entries.map((e) => ({ id: e.id, date: e.entry_date, sectionLabel: label.get(secOf.get(e.id) ?? "") ?? "", subject: e.subject_id ? (subjects[e.subject_id] ?? "Subject") : "Class remark", status: e.status, body: e.body }));
}
