/** Certificates (TC, bonafide, study): types and the pure wording logic shared by the screens, the print sheet and the tests. No database calls. */

export type Kind = "tc" | "bonafide" | "study";
export type Lang = "en" | "te" | "both";
export type TextEntry = { en: string; te: string; te_checked: boolean };

export type Payload = {
  student: {
    name: string; name_te: string | null; admission_no: string; gender: string; dob: string; dob_words: string;
    father: string | null; father_te: string | null; mother: string | null; mother_te: string | null;
    nationality: string | null; religion: string | null; caste: string | null; child_en: string; child_te: string; admission_date: string;
  };
  class: { year: string | null; class: string | null; section: string | null; medium: string | null };
  purpose?: string;
  history?: { year: string; class: string; section: string; medium: string | null }[];
  history_gaps?: string[];
  tc?: { leaving_date: string; reason_key: string; reason: string; reason_note: string | null; conduct: string; remarks: string | null; last_exam: string; fees_paid: string };
};
export type CheckItem = { key: string; label: string; status: "ok" | "fail" | "warn"; detail: string; href: string; amount_paise?: number; count?: number };
export type SchoolHeader = { name: string; address: string; udise_code: string | null; affiliation_no: string | null; logo_path: string | null; principal_name: string | null; missing: string[]; signature_path: string | null };
export type Bundle = {
  kind: Kind;
  language: Lang;
  certificate: null | { id: string; number: string; status: "issued" | "cancelled"; issue_date: string; place: string | null; student_id: string; cancel_reason: string | null };
  payload: Payload;
  duplicate: null | { is_duplicate: boolean; copy_no: number; printed_at: string; reason: string | null; reason_note: string | null };
  title_en: string;
  title_te: string;
  texts: Record<string, TextEntry>;
  flags: { draft_layout: boolean; draft_wording: boolean; telugu_unchecked: boolean };
  school: SchoolHeader;
  checklist?: CheckItem[] | null;
};

export const KIND_LABEL: Record<Kind, string> = { tc: "Transfer Certificate (TC)", bonafide: "Bonafide certificate", study: "Study certificate" };
export const KIND_SHORT: Record<Kind, string> = { tc: "TC", bonafide: "Bonafide", study: "Study" };
export const LANG_LABEL: Record<Lang, string> = { en: "English", te: "Telugu", both: "English and Telugu" };
export const KINDS: Kind[] = ["tc", "bonafide", "study"];

export const LEAVING_REASONS: { value: string; label: string }[] = [
  { value: "transfer", label: "Transfer to another school" },
  { value: "moved", label: "Family moved" },
  { value: "completed_10", label: "Completed Class 10" },
  { value: "other", label: "Other (write it below)" },
];
export const BONAFIDE_PURPOSES = ["Scholarship", "Passport", "Bank account", "Other"];
export const DUPLICATE_REASONS: { value: string; label: string }[] = [
  { value: "lost", label: "Lost" },
  { value: "damaged", label: "Damaged" },
  { value: "parent_request", label: "Parent request" },
  { value: "office_copy", label: "Office copy" },
  { value: "other", label: "Other (write it below)" },
];
export const DUPLICATE_REASON_LABEL: Record<string, string> = Object.fromEntries(DUPLICATE_REASONS.map((r) => [r.value, r.label.replace(/ \(write it below\)/, "")]));

/** 2014-01-15 -> 15/01/2014 */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(iso)) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${y}`;
}

/** Replaces {name}-style placeholders. Unknown placeholders are left visible so a typo in the wording is noticed, never silently dropped. */
export function fillTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{([a-z_]+)\}/g, (m, k: string) => (k in vars ? vars[k] : m));
}

export type Line = { key: string; label: { en: string; te: string }; value: { en: string; te: string } };
export type LineOptions = { showNationality?: boolean; showReligion?: boolean; showCaste?: boolean };

const t = (b: Bundle, key: string) => b.texts[key] ?? { en: key, te: key, te_checked: false };

/** The fields of a TC, in order. Values that exist in Telugu (the names) have a Telugu form; the rest are the same in both languages. */
export function tcLines(b: Bundle, o: LineOptions = {}): Line[] {
  const s = b.payload.student;
  const tc = b.payload.tc;
  const line = (key: string, en: string, te: string = en): Line => ({ key, label: { en: t(b, key).en, te: t(b, key).te }, value: { en, te } });
  const cls = [b.payload.class.class, b.payload.class.section && `– ${b.payload.class.section}`].filter(Boolean).join(" ");
  const out: Line[] = [
    line("admission_no", s.admission_no),
    line("name", s.name, s.name_te ?? s.name),
    ...(s.father ? [line("father", s.father, s.father_te ?? s.father)] : []),
    ...(s.mother ? [line("mother", s.mother, s.mother_te ?? s.mother)] : []),
  ];
  if (o.showNationality !== false && s.nationality) out.push(line("nationality", s.nationality));
  if (o.showReligion !== false && s.religion) out.push(line("religion", s.religion));
  if (o.showCaste !== false && s.caste) out.push(line("caste", s.caste));
  out.push(line("dob", fmtDate(s.dob)), line("dob_words", s.dob_words), line("class_studied", cls));
  if (tc) {
    out.push(line("last_exam", tc.last_exam), line("conduct", tc.conduct), line("fees_paid", tc.fees_paid),
      line("reason", tc.reason + (tc.reason_note ? `: ${tc.reason_note}` : "")), line("leaving_date", fmtDate(tc.leaving_date)));
    if (tc.remarks) out.push(line("remarks", tc.remarks));
  }
  return out;
}

/** The sentence of a bonafide or study certificate, in one language. */
export function bodySentence(b: Bundle, lang: "en" | "te"): string {
  const s = b.payload.student;
  const cls = [b.payload.class.class, b.payload.class.section && `– ${b.payload.class.section}`].filter(Boolean).join(" ");
  const vars: Record<string, string> = {
    name: lang === "te" ? (s.name_te ?? s.name) : s.name,
    father: lang === "te" ? (s.father_te ?? s.father ?? "") : (s.father ?? ""),
    child: lang === "te" ? s.child_te : s.child_en,
    class: cls, year: b.payload.class.year ?? "", dob: fmtDate(s.dob), purpose: b.payload.purpose ?? "",
  };
  return fillTemplate(t(b, "body")[lang], vars);
}

/** What stands in the way of printing this certificate as it is (shown to the person printing, never printed). */
export function printWarnings(b: Bundle, lang: Lang): string[] {
  const w: string[] = [];
  if (b.school.missing.length) w.push(`School details missing in Settings: ${b.school.missing.join(", ")}.`);
  if (lang !== "en" && !b.payload.student.name_te) w.push("Telugu name not entered. Choose English, or enter it on the student record.");
  if (lang !== "en" && b.flags.telugu_unchecked) w.push("Some Telugu wording has not been checked by a Telugu speaker yet.");
  if (b.flags.draft_wording && b.kind !== "tc") w.push("Draft wording, to be confirmed by the school.");
  if (b.kind === "tc" && b.flags.draft_layout) w.push("DRAFT layout - not for issue. The TC layout has not been confirmed yet.");
  if ((b.payload.history_gaps ?? []).length) w.push(`The class history has no record for ${b.payload.history_gaps!.join(", ")}. Only the years on record are listed.`);
  return w;
}

export const showsDraftMark = (b: Bundle) => b.kind === "tc" && b.flags.draft_layout;
export const showsDuplicateMark = (b: Bundle) => !!b.duplicate?.is_duplicate;
