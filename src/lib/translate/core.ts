/**
 * English -> Telugu translation rules. Pure logic with injected provider and store,
 * so it is tested with a mocked provider (no network). Only general school text
 * (diary lines, notices) may ever be translated: student-specific content (fees,
 * absences, marks) never goes through here.
 */
import { createHash } from "node:crypto";

export const ALLOWED_PURPOSES = ["diary", "notice"] as const;
export type Purpose = (typeof ALLOWED_PURPOSES)[number];

/** Takes HTML (numbers wrapped as do-not-translate) and returns translated HTML. */
export type Provider = { name: string; translate(html: string): Promise<string> };
export type Store = {
  cacheGet(hash: string): Promise<string | null>;
  cachePut(hash: string, te: string, chars: number): Promise<void>;
  /** counts the characters against the monthly cap; false = over the cap */
  reserve(chars: number): Promise<boolean>;
};

export type TranslateResult = { ok: true; te: string; cached: boolean } | { ok: false; reason: "not_configured" | "cap" | "failed" | "has_telugu" | "empty" | "validation" };

const TELUGU = /[ఀ-౿]/;
export const hasTelugu = (s: string) => TELUGU.test(s);
export const md5 = (s: string) => createHash("md5").update(s.trim()).digest("hex");
const sha = (s: string) => createHash("sha256").update(s.trim().replace(/\s+/g, " ")).digest("hex");

/** numbers, exercise / page numbers and ranges: "5.1", "1-6", "10:30", "20" */
const NUMBER = /\d+(?:[.,:/\-–]\d+)*/g;
export const numberTokens = (s: string) => s.match(NUMBER) ?? [];
const norm = (t: string) => t.replace(/–/g, "-");
/** Same numbers, same number of times. Telugu word order differs from English, so the ORDER may change. */
export function sameNumbers(a: string, b: string): boolean {
  const x = numberTokens(a).map(norm).sort();
  const y = numberTokens(b).map(norm).sort();
  return x.length === y.length && x.every((t, i) => t === y[i]);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function unesc(s: string) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

/** English text -> HTML where every number is marked do-not-translate. */
export function protectNumbers(text: string): string {
  let out = "";
  let last = 0;
  for (const m of text.matchAll(NUMBER)) {
    out += esc(text.slice(last, m.index)) + `<span class="notranslate" translate="no">${m[0]}</span>`;
    last = m.index! + m[0].length;
  }
  return (out + esc(text.slice(last))).replace(/\n/g, "<br>");
}
export function restoreText(html: string): string {
  return unesc(html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?span[^>]*>/gi, "")).replace(/[ \t]+\n/g, "\n").trim();
}

export async function translateToTelugu(text: string, o: { purpose: string; provider: Provider | null; store: Store }): Promise<TranslateResult> {
  if (!(ALLOWED_PURPOSES as readonly string[]).includes(o.purpose)) throw new Error(`Translation is not allowed for "${o.purpose}" (only general diary and notice text).`);
  const src = text.trim();
  if (!src) return { ok: false, reason: "empty" };
  if (hasTelugu(src)) return { ok: false, reason: "has_telugu" };
  const key = sha(src);
  const hit = await o.store.cacheGet(key);
  if (hit) return { ok: true, te: hit, cached: true };
  if (!o.provider) return { ok: false, reason: "not_configured" };
  if (!(await o.store.reserve(src.length))) return { ok: false, reason: "cap" };
  let te: string;
  try {
    te = restoreText(await o.provider.translate(protectNumbers(src)));
  } catch {
    return { ok: false, reason: "failed" };
  }
  if (!te || !hasTelugu(te)) return { ok: false, reason: "failed" };
  if (!sameNumbers(src, te)) return { ok: false, reason: "validation" };
  await o.store.cachePut(key, te, src.length);
  return { ok: true, te, cached: false };
}

export type EntryForPlan = { body: string; body_te: string | null; te_status: "none" | "pending" | "auto" | "reviewed"; te_src_hash: string | null };
export type Plan = "translate" | "reviewed" | "unchanged" | "has_telugu" | "empty";

/** What to do for a submitted line: translate only when needed, never over reviewed Telugu. */
export function planEntryTranslation(e: EntryForPlan): Plan {
  if (!e.body.trim()) return "empty";
  if (e.te_status === "reviewed") return "reviewed";
  if (hasTelugu(e.body)) return "has_telugu";
  if (e.te_status === "auto" && e.body_te && e.te_src_hash === md5(e.body)) return "unchanged";
  return "translate";
}
