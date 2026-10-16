/** Pure helpers for Notices and Diary (server + client). */
export const AUDIENCE_LABEL = { all: "All staff", roles: "Selected roles", classes: "Selected classes", teachers: "Specific teachers" } as const;
export type Audience = keyof typeof AUDIENCE_LABEL;

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

/** A circular as plain text for WhatsApp. */
export function noticeWhatsApp(n: { school: string; circularNo: string | null; date: string; title: string; body: string; audienceLine: string }) {
  return [
    `*${n.school}*`,
    n.circularNo ? `Circular No: ${n.circularNo}` : "Circular (draft)",
    `Date: ${fmtShort(n.date)}`,
    "",
    `*${n.title}*`,
    "",
    n.body.trim(),
    "",
    `For: ${n.audienceLine}`,
    "- Principal",
  ].join("\n");
}

export type NoticeStateName = "draft" | "scheduled" | "active" | "expired" | "archived";
export function noticeState(n: { archived_at: string | null; status: string; publish_date: string; expires_on: string | null }, today: string): NoticeStateName {
  if (n.archived_at) return "archived";
  if (n.status === "draft") return "draft";
  if (n.expires_on && n.expires_on < today) return "expired";
  if (n.publish_date > today) return "scheduled";
  return "active";
}
