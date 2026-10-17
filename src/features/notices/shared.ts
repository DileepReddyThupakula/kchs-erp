/** Pure helpers for Notices and Diary (server + client). */
export const AUDIENCE_LABEL = {
  all: "All staff",
  roles: "Selected roles",
  classes: "Teachers of selected classes",
  teachers: "Specific teachers",
  parents_all: "Parents and students: whole school",
  parents_classes: "Parents and students: selected classes",
} as const;
export type Audience = keyof typeof AUDIENCE_LABEL;
/** Notices written for parents: shared by print or WhatsApp only. Parents never log in. */
export const isParentsAudience = (a: string) => a === "parents_all" || a === "parents_classes";
export const PARENTS_TO = "Parents and students";

export const ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "teacher", label: "Teachers" },
] as const;

export const ATTACH_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export const ATTACH_MAX = 5 * 1024 * 1024;

export function fmtLong(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}
export function fmtShort(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" });
}
export function addDaysIso(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export type DiaryLine = { subject: string | null; body: string };

/** The day's diary as plain text for pasting into a class WhatsApp group. */
export function diaryWhatsApp(opts: { school: string; classLabel: string; date: string; lines: DiaryLine[] }) {
  const out = [`*${opts.school}*`, `*Daily diary · ${opts.classLabel}*`, fmtLong(opts.date), ""];
  opts.lines.forEach((l, i) => {
    const has = l.subject && l.body.toLowerCase().startsWith(l.subject.toLowerCase());
    out.push(`${i + 1}. ${l.subject && !has ? `*${l.subject}:* ` : ""}${l.body.replace(/\n+/g, " ")}`);
  });
  if (!opts.lines.length) out.push("No diary entries for this day.");
  return out.join("\n");
}

/**
 * A circular as WhatsApp text: English first, then Telugu (when there is Telugu), clearly separated.
 * No file names or paths, no student names, no signature.
 */
export function noticeWhatsApp(n: { school: string; circularNo: string | null; date: string; title: string; body: string; titleTe?: string | null; bodyTe?: string | null; audienceLine: string }) {
  const out = [`*${n.school}*`, n.circularNo ? `Circular No: ${n.circularNo}` : "Circular (draft)", `Date: ${fmtShort(n.date)}`, "", `*${n.title}*`, "", n.body.trim()];
  if (n.titleTe || n.bodyTe) {
    out.push("", "──────────", "*తెలుగు*");
    if (n.titleTe) out.push(`*${n.titleTe}*`, "");
    if (n.bodyTe) out.push(n.bodyTe.trim());
  }
  out.push("", `To: ${n.audienceLine}`, "- Principal");
  return out.join("\n");
}

export type NoticeStateName = "draft" | "scheduled" | "active" | "expired" | "archived";
export function noticeState(n: { archived_at: string | null; status: string; publish_date: string; expires_on: string | null }, today: string): NoticeStateName {
  if (n.archived_at) return "archived";
  if (n.status === "draft") return "draft";
  if (n.expires_on && n.expires_on < today) return "expired";
  if (n.publish_date > today) return "scheduled";
  return "active";
}

// ------------------------------------------------------------------ diary workflow
export type DiaryStatus = "draft" | "submitted" | "published";
export const STATUS_TEXT: Record<DiaryStatus | "new" | "missing" | "skipped", string> = { new: "Not started", draft: "Draft", submitted: "Submitted", published: "Published", missing: "Not submitted", skipped: "Skipped" };

export function weekdayOf(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-IN", { weekday: "long", timeZone: "UTC" });
}
export const FAR_AHEAD_DAYS = 7;

/** A class is late when its expected subjects are not all in and the deadline (HH:MM, school time) has passed. */
export function diaryIsLate(o: { date: string; today: string; nowHm: string; deadline: string; complete: boolean; expected: number }) {
  if (o.complete || o.expected === 0) return false;
  if (o.date < o.today) return true;
  return o.date === o.today && o.nowHm > o.deadline.slice(0, 5);
}

/** One line of a class's combined diary. */
export type CombinedLine = { subject: string | null; subjectTe?: string | null; body: string; bodyTe: string | null };

/** Remove a leading "Subject:" the teacher typed (the card and message already show the subject). The stored text is not changed. */
export function stripSubjectPrefix(text: string, names: (string | null | undefined)[]): string {
  let out = text.trim();
  for (const n of names) {
    if (!n) continue;
    const esc = n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`^${esc}\\s*[:：\\-–]\\s*`, "i");
    if (re.test(out) && out.replace(re, "").trim()) out = out.replace(re, "").trim();
  }
  return out;
}
/** Lines as parents see them: duplicate "Subject:" prefixes removed. */
export function cleanLines(lines: CombinedLine[]): CombinedLine[] {
  return lines.map((l) => (l.subject ? { ...l, body: stripSubjectPrefix(l.body, [l.subject, l.subjectTe]), bodyTe: l.bodyTe ? stripSubjectPrefix(l.bodyTe, [l.subjectTe, l.subject]) : l.bodyTe } : l));
}

function diaryParts(raw: CombinedLine[]) {
  const lines = cleanLines(raw);
  const subj = lines.filter((l) => l.subject);
  const remark = lines.find((l) => !l.subject);
  const flat = (t: string) => t.replace(/\n+/g, " ");
  const en = subj.map((l, i) => `${i + 1}. *${l.subject}:* ${flat(l.body)}`);
  if (remark) en.push("", `*Class remark:* ${flat(remark.body)}`);
  if (!lines.length) en.push("No diary entries for this day.");
  const te = subj.filter((l) => l.bodyTe).map((l, i) => `${i + 1}. *${l.subjectTe || l.subject}:* ${flat(l.bodyTe!)}`);
  if (remark?.bodyTe) te.push("", `*తరగతి సూచన:* ${flat(remark.bodyTe)}`);
  return { en, te };
}
const TE_RULE = ["", "──────────", "*తెలుగు*"];

/**
 * The combined class diary as WhatsApp text: English first, then Telugu (only where a Telugu text was written),
 * subjects in timetable order, class remark last. Teacher names are never included.
 */
export function combinedDiaryText(o: { school: string; classLabel: string; date: string; lines: CombinedLine[] }) {
  const { en, te } = diaryParts(o.lines);
  return [`*${o.school}*`, `*Daily diary · ${o.classLabel}*`, fmtLong(o.date), "", ...en, ...(te.length ? [...TE_RULE, ...te] : [])].join("\n");
}

/** One school-group message for several classes (each class has its own image). */
export function multiClassDiaryText(o: { school: string; date: string; classes: { classLabel: string; lines: CombinedLine[] }[] }) {
  const out = [`*${o.school}*`, "*Daily diary*", fmtLong(o.date)];
  for (const c of o.classes) {
    const { en, te } = diaryParts(c.lines);
    out.push("", `━━ *${c.classLabel}* ━━`, ...en, ...(te.length ? [...TE_RULE, ...te] : []));
  }
  return out.join("\n");
}
