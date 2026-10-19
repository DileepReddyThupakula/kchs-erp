// @vitest-environment node
// Telugu on paper: each certificate (English + Telugu, and Telugu only) is printed to PDF by a headless Chrome and must be ONE A4 page
// that uses a Telugu font (so no broken boxes). Skipped when Chrome is not installed on this machine.
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
import { CertificateSheet } from "@/components/certificates/sheet";
import type { Bundle, Kind, TextEntry } from "@/features/certificates/shared";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const te = (en: string, t: string): TextEntry => ({ en, te: t, te_checked: true });
const texts: Record<string, TextEntry> = {
  admission_no: te("Admission number", "ప్రవేశ సంఖ్య"), name: te("Name of the student", "విద్యార్థి పేరు"), father: te("Father's name", "తండ్రి పేరు"), mother: te("Mother's name", "తల్లి పేరు"),
  nationality: te("Nationality", "జాతీయత"), religion: te("Religion", "మతం"), caste: te("Caste", "కులం"), dob: te("Date of birth (in figures)", "పుట్టిన తేదీ (అంకెలలో)"), dob_words: te("Date of birth (in words)", "పుట్టిన తేదీ (అక్షరాలలో)"),
  class_studied: te("Class last studied", "చివరిగా చదివిన తరగతి"), last_exam: te("Result of the last examination", "చివరి పరీక్ష ఫలితం"), conduct: te("Conduct", "ప్రవర్తన"), fees_paid: te("Fees paid", "ఫీజు చెల్లింపు"),
  reason: te("Reason for leaving", "పాఠశాల విడిచిన కారణం"), leaving_date: te("Date of leaving", "పాఠశాల విడిచిన తేదీ"), remarks: te("Remarks", "వ్యాఖ్యలు"),
  declaration: te("Certified that the above particulars are correct as per the school records.", "పై వివరాలు పాఠశాల రికార్డుల ప్రకారం సరైనవని ధృవీకరించడమైనది."),
  place: te("Place", "ప్రదేశం"), date_of_issue: te("Date of issue", "జారీ చేసిన తేదీ"), sig_principal: te("Signature of the Principal", "ప్రధానోపాధ్యాయుల సంతకం"), seal: te("Seal of the school", "పాఠశాల ముద్ర"),
  sig_class_teacher: te("Class teacher", "తరగతి ఉపాధ్యాయుడు"), sig_clerk: te("Clerk", "గుమాస్తా"), duplicate: te("DUPLICATE", "నకలు"),
  body: te("This is to certify that {name}, {child} of {father}, is a bonafide student of this school, studying {class} in the academic year {year}. Date of birth: {dob}. This certificate is issued for {purpose}.",
           "{name}, {father} యొక్క {child}, ఈ పాఠశాలలో {year} విద్యా సంవత్సరంలో {class} చదువుతున్న నిజమైన విద్యార్థి అని ధృవీకరించడమైనది. పుట్టిన తేదీ: {dob}. ఈ ధృవీకరణ పత్రం {purpose} కొరకు జారీ చేయబడింది."),
  col_year: te("Academic year", "విద్యా సంవత్సరం"), col_class: te("Class", "తరగతి"), col_medium: te("Medium", "మాధ్యమం"),
};
const bundle = (kind: Kind, dup = false): Bundle => ({
  kind, language: "both",
  certificate: { id: "c1", number: `${kind.toUpperCase()}/2026-27/001`, status: "issued", issue_date: "2026-10-19", place: "ఎర్రగుంట్ల / Yerraguntla", student_id: "s1", cancel_reason: null },
  payload: {
    student: { name: "Ravi Kumar", name_te: "రవి కుమార్ రెడ్డి", admission_no: "A-1", gender: "male", dob: "2014-01-15", dob_words: "Fifteenth January Two Thousand Fourteen", father: "Ramesh Kumar", father_te: "రమేష్ కుమార్ రెడ్డి", mother: "Lakshmi", mother_te: "లక్ష్మి దేవి",
      nationality: "Indian", religion: "Hindu", caste: "Reddy", child_en: "son", child_te: "కుమారుడు", admission_date: "2020-06-01" },
    class: { year: "2026-27", class: "Class 6", section: "A", medium: "Telugu" },
    ...(kind === "bonafide" ? { purpose: "bank account" } : {}),
    ...(kind === "study" ? { history: Array.from({ length: 11 }, (_, i) => ({ year: `${2016 + i}-${17 + i}`, class: i < 3 ? "Nursery" : `Class ${i - 2}`, section: "A", medium: "Telugu" })), history_gaps: [] } : {}),
    ...(kind === "tc" ? { tc: { leaving_date: "2026-10-01", reason_key: "other", reason: "Other", reason_note: "Family moved to another district for work", conduct: "Good", remarks: "A hard-working student", last_exam: "Passed", fees_paid: "All fees paid" } } : {}),
  },
  duplicate: { is_duplicate: dup, copy_no: dup ? 2 : 1, printed_at: "2026-10-20T05:00:00Z", reason: dup ? "lost" : null, reason_note: null },
  title_en: kind === "tc" ? "TRANSFER CERTIFICATE" : kind === "bonafide" ? "BONAFIDE CERTIFICATE" : "STUDY CERTIFICATE", title_te: kind === "tc" ? "బదిలీ ధృవీకరణ పత్రం" : kind === "bonafide" ? "బోనఫైడ్ సర్టిఫికేట్" : "స్టడీ సర్టిఫికేట్", texts,
  flags: { draft_layout: kind === "tc", draft_wording: false, telugu_unchecked: false },
  school: { name: "KCHS", address: "", udise_code: null, affiliation_no: null, logo_path: null, principal_name: "డా. ప్రధానోపాధ్యాయులు", missing: [], signature_path: null },
});

const school = { name: "Krishna Chaitanya High School", address: "Yerraguntla, YSR Kadapa District, Andhra Pradesh, 516309", phone: "9000000000", udise: "28120100101", recognition: "REC/2026/77", logoUrl: "" };
const PAGE = (body: string) => `<!doctype html><html><head><meta charset="utf-8"><style>
:root{--font-noto-sans:"Helvetica Neue",Arial;--font-noto-telugu:"Noto Sans Telugu","Telugu MN","Telugu Sangam MN";--font-cinzel:Georgia}
@page{size:A4 portrait;margin:0} html,body{margin:0;padding:0} article{break-after:auto !important}</style></head><body>${body}</body></html>`;

const available = existsSync(CHROME);
describe.skipIf(!available)("Telugu certificates print correctly on one A4 page", () => {
  const dir = mkdtempSync(join(tmpdir(), "kchs-cert-"));
  const cases: { name: string; kind: Kind; lang: "both" | "te"; dup?: boolean }[] = [
    { name: "tc-both-draft", kind: "tc", lang: "both" }, { name: "tc-te", kind: "tc", lang: "te" },
    { name: "bonafide-both", kind: "bonafide", lang: "both" }, { name: "bonafide-te-duplicate", kind: "bonafide", lang: "te", dup: true },
    { name: "study-both-11-years", kind: "study", lang: "both" },
  ];
  for (const c of cases) {
    it(`${c.name}: one A4 page, Telugu font used`, () => {
      const html = PAGE(renderToStaticMarkup(<CertificateSheet bundle={bundle(c.kind, c.dup)} lang={c.lang} school={school} footer="Printed on 19 Oct 2026 by Demo Admin · Confidential - for school use" />));
      const f = join(dir, `${c.name}.html`);
      const pdf = join(dir, `${c.name}.pdf`);
      writeFileSync(f, html);
      execFileSync(CHROME, ["--headless=new", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer", `--print-to-pdf=${pdf}`, `file://${f}`], { stdio: "ignore", timeout: 45000 });
      const bytes = readFileSync(pdf).toString("latin1");
      const pages = (bytes.match(/\/Type\s*\/Page[^s]/g) ?? []).length;
      expect(pages).toBe(1);
      const m = bytes.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
      expect(Math.round(Number(m![1]))).toBe(595);                                  // A4 width in points
      expect(Math.round(Number(m![2]))).toBe(842);                                  // A4 height
      expect(/BaseFont\s*\/[A-Z]{6}\+[A-Za-z]*Telugu/i.test(bytes)).toBe(true);     // a Telugu font was embedded: no empty boxes
    }, 60000);
  }
});
