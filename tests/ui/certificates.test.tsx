// Certificate screens: the print sheet (marks, boxes, warnings), the print panel (original / duplicate / reason / Telugu), the issue form gates,
// the checklist, cancel, settings, and who sees the menu entry.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh, replace: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams("") }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const printAction = vi.fn();
const cancelCheck = vi.fn();
const cancelAction = vi.fn();
vi.mock("@/features/certificates/actions", () => ({
  printCertificate: (...a: unknown[]) => printAction(...a), cancelCheck: (...a: unknown[]) => cancelCheck(...a), cancelCertificate: (...a: unknown[]) => cancelAction(...a),
  searchStudents: vi.fn(), previewCertificate: vi.fn(), issueCertificate: vi.fn(), tcChecklist: vi.fn(), exportRegister: vi.fn(),
  savePrefixes: vi.fn(), setStartNumber: vi.fn(), setDraft: vi.fn(), confirmWording: vi.fn(), saveText: vi.fn(), confirmTelugu: vi.fn(), setSignatureImage: vi.fn(),
}));
vi.mock("@/lib/export", () => ({ exportSheets: vi.fn() }));

import { CertificateSheet } from "@/components/certificates/sheet";
import { CertificatePrintPanel } from "@/components/certificates/print-panel";
import { overrideState, TcChecklist } from "@/components/certificates/tc-checklist";
import { CancelCertificate } from "@/components/certificates/register-tools";
import { DraftPanel, NumberingPanel, WordingPanel, type TemplateRow } from "@/components/certificates/settings-panels";
import { IssueForm } from "@/components/certificates/issue-form";
import { bodySentence, fillTemplate, fmtDate, printWarnings, tcLines, type Bundle, type CheckItem, type Kind, type TextEntry } from "@/features/certificates/shared";
import { buildMenu, canOpenPage, findPage } from "@/lib/site-map";

const school = { name: "Krishna Chaitanya High School", address: "Yerraguntla, YSR Kadapa", phone: null, udise: "28120100101", recognition: "REC-77", logoUrl: "/logo.png" };
const te = (en: string, t: string, checked = false): TextEntry => ({ en, te: t, te_checked: checked });
const texts: Record<string, TextEntry> = {
  admission_no: te("Admission number", "ప్రవేశ సంఖ్య"), name: te("Name of the student", "విద్యార్థి పేరు"), father: te("Father's name", "తండ్రి పేరు"), mother: te("Mother's name", "తల్లి పేరు"),
  nationality: te("Nationality", "జాతీయత"), religion: te("Religion", "మతం"), caste: te("Caste", "కులం"), dob: te("Date of birth (in figures)", "పుట్టిన తేదీ"), dob_words: te("Date of birth (in words)", "పుట్టిన తేదీ (అక్షరాలలో)"),
  class_studied: te("Class last studied", "చివరిగా చదివిన తరగతి"), last_exam: te("Result of the last examination", "చివరి పరీక్ష ఫలితం"), conduct: te("Conduct", "ప్రవర్తన"), fees_paid: te("Fees paid", "ఫీజు చెల్లింపు"),
  reason: te("Reason for leaving", "కారణం"), leaving_date: te("Date of leaving", "విడిచిన తేదీ"), remarks: te("Remarks", "వ్యాఖ్యలు"), declaration: te("Certified that the above particulars are correct.", "పై వివరాలు సరైనవి."),
  place: te("Place", "ప్రదేశం"), date_of_issue: te("Date of issue", "జారీ తేదీ"), sig_principal: te("Signature of the Principal", "ప్రధానోపాధ్యాయుల సంతకం"), seal: te("Seal of the school", "పాఠశాల ముద్ర"),
  sig_class_teacher: te("Class teacher", "తరగతి ఉపాధ్యాయుడు"), sig_clerk: te("Clerk", "గుమాస్తా"), duplicate: te("DUPLICATE", "నకలు"),
  body: te("This is to certify that {name}, {child} of {father}, is a bonafide student of this school, studying {class} in the academic year {year}. Date of birth: {dob}. This certificate is issued for {purpose}.", "{name}, {father} యొక్క {child}, {year} లో {class} చదువుతున్నారు. {purpose} కొరకు."),
  col_year: te("Academic year", "విద్యా సంవత్సరం"), col_class: te("Class", "తరగతి"), col_medium: te("Medium", "మాధ్యమం"),
};
const bundle = (kind: Kind, o: Partial<Bundle> = {}): Bundle => ({
  kind, language: "en",
  certificate: { id: "c1", number: `${kind === "tc" ? "TC" : "BON"}/2026-27/001`, status: "issued", issue_date: "2026-10-19", place: "Yerraguntla", student_id: "s1", cancel_reason: null },
  payload: {
    student: { name: "Ravi Kumar", name_te: "రవి కుమార్", admission_no: "A-1", gender: "male", dob: "2014-01-15", dob_words: "Fifteenth January Two Thousand Fourteen", father: "Ramesh Kumar", father_te: "రమేష్ కుమార్", mother: "Lakshmi", mother_te: "లక్ష్మి",
      nationality: "Indian", religion: "Hindu", caste: "Kamma", child_en: "son", child_te: "కుమారుడు", admission_date: "2020-06-01" },
    class: { year: "2026-27", class: "Class 6", section: "A", medium: "Telugu" },
    ...(kind === "bonafide" ? { purpose: "bank account" } : {}),
    ...(kind === "study" ? { history: [{ year: "2025-26", class: "Class 5", section: "A", medium: "Telugu" }, { year: "2026-27", class: "Class 6", section: "A", medium: "Telugu" }], history_gaps: [] } : {}),
    ...(kind === "tc" ? { tc: { leaving_date: "2026-10-01", reason_key: "moved", reason: "Family moved", reason_note: null, conduct: "Good", remarks: null, last_exam: "Passed", fees_paid: "All fees paid" } } : {}),
  },
  duplicate: { is_duplicate: false, copy_no: 1, printed_at: "2026-10-19T05:00:00Z", reason: null, reason_note: null },
  title_en: kind === "tc" ? "TRANSFER CERTIFICATE" : kind === "bonafide" ? "BONAFIDE CERTIFICATE" : "STUDY CERTIFICATE", title_te: "బదిలీ ధృవీకరణ పత్రం", texts,
  flags: { draft_layout: kind === "tc", draft_wording: kind !== "tc", telugu_unchecked: true },
  school: { name: school.name, address: school.address, udise_code: "28120100101", affiliation_no: "REC-77", logo_path: "logo", principal_name: "Dr. Principal", missing: [], signature_path: null }, ...o,
});
const FOOT = "Printed on 19 Oct 2026 by Demo Admin · Confidential - for school use";
const sheet = (b: Bundle, lang: "en" | "te" | "both" = "en") => render(<CertificateSheet bundle={b} lang={lang} school={school} footer={FOOT} />);

beforeEach(() => { printAction.mockReset(); cancelCheck.mockReset(); cancelAction.mockReset(); refresh.mockReset(); window.print = vi.fn(); });
afterEach(cleanup);

describe("the wording logic", () => {
  it("fills placeholders and leaves an unknown one visible", () => {
    expect(fillTemplate("Hi {name}, {oops}", { name: "Ravi" })).toBe("Hi Ravi, {oops}");
    expect(fmtDate("2014-01-15")).toBe("15/01/2014");
  });
  it("the TC lists caste and religion only when they exist and are switched on", () => {
    const keys = (o = {}) => tcLines(bundle("tc"), o).map((l) => l.key);
    expect(keys()).toEqual(expect.arrayContaining(["religion", "caste", "nationality"]));
    expect(keys({ showCaste: false, showReligion: false })).not.toContain("caste");
    const none = bundle("tc"); none.payload.student.religion = null; none.payload.student.caste = null;
    expect(tcLines(none).map((l) => l.key)).not.toContain("religion");
  });
  it("English and Telugu sentences come from the template, the Telugu one with the Telugu name", () => {
    const b = bundle("bonafide");
    expect(bodySentence(b, "en")).toBe("This is to certify that Ravi Kumar, son of Ramesh Kumar, is a bonafide student of this school, studying Class 6 – A in the academic year 2026-27. Date of birth: 15/01/2014. This certificate is issued for bank account.");
    expect(bodySentence(b, "te")).toContain("రవి కుమార్, రమేష్ కుమార్ యొక్క కుమారుడు");
  });
  it("warnings: missing school details, missing Telugu name, unchecked Telugu, draft layout and draft wording", () => {
    const b = bundle("tc");
    b.school.missing = ["UDISE code"]; b.payload.student.name_te = null;
    const w = printWarnings(b, "both").join(" | ");
    expect(w).toMatch(/School details missing in Settings: UDISE code/);
    expect(w).toMatch(/Telugu name not entered/);
    expect(w).toMatch(/not been checked by a Telugu speaker/);
    expect(w).toMatch(/DRAFT layout - not for issue/);
    expect(printWarnings(bundle("bonafide"), "en").join()).toMatch(/Draft wording, to be confirmed/);
    expect(printWarnings(bundle("bonafide"), "en").join()).not.toMatch(/Telugu/);
  });
});

describe("the printed sheet", () => {
  it("a TC shows the DRAFT mark while the layout is a draft; a bonafide never does", () => {
    sheet(bundle("tc"));
    expect(screen.getByTestId("draft-mark").textContent).toMatch(/DRAFT layout/);
    cleanup();
    sheet(bundle("bonafide"));
    expect(screen.queryByTestId("draft-mark")).toBeNull();
    cleanup();
    sheet(bundle("tc", { flags: { draft_layout: false, draft_wording: false, telugu_unchecked: false } }));
    expect(screen.queryByTestId("draft-mark")).toBeNull();
  });
  it("a reprint shows DUPLICATE with the copy number, the date and the reason", () => {
    sheet(bundle("bonafide", { duplicate: { is_duplicate: true, copy_no: 2, printed_at: "2026-10-20T05:00:00Z", reason: "lost", reason_note: null } }));
    expect(screen.getByTestId("duplicate-mark").textContent).toBe("DUPLICATE");
    expect(screen.getByTestId("duplicate-note").textContent).toBe("DUPLICATE copy no. 2, printed on 20/10/2026. Reason: Lost.");
    cleanup();
    sheet(bundle("bonafide"));
    expect(screen.queryByTestId("duplicate-mark")).toBeNull();
  });
  it("blank signature and seal areas, the school's header, the footer and a free corner for a future QR code", () => {
    const { container } = sheet(bundle("tc"));
    const t = container.textContent ?? "";
    expect(t).toContain("Signature of the Principal"); expect(t).toContain("Dr. Principal"); expect(t).toContain("Seal of the school"); expect(t).toContain("Class teacher"); expect(t).toContain("Clerk");
    expect(t).toContain("Krishna Chaitanya High School"); expect(t).toContain("UDISE: 28120100101"); expect(t).toContain("Recognition No: REC-77");
    expect(t).toContain(FOOT);
    expect(screen.getByTestId("seal-box").textContent).toBe("Seal of the school");
    expect(container.querySelector("img[src*='sign']")).toBeNull();            // no signature image is ever printed
    expect(screen.getByTestId("qr-reserved").children).toHaveLength(0);
  });
  it("English, Telugu and bilingual", () => {
    const en = sheet(bundle("tc"), "en").container.textContent ?? ""; cleanup();
    expect(en).toContain("Name of the student"); expect(en).not.toContain("విద్యార్థి పేరు");
    const tel = sheet(bundle("tc"), "te").container.textContent ?? ""; cleanup();
    expect(tel).toContain("విద్యార్థి పేరు"); expect(tel).toContain("రవి కుమార్"); expect(tel).not.toContain("Name of the student");
    const both = sheet(bundle("tc"), "both").container.textContent ?? "";
    expect(both).toContain("Name of the student"); expect(both).toContain("విద్యార్థి పేరు"); expect(both).toContain("Ravi Kumar"); expect(both).toContain("రవి కుమార్");
  });
  it("a study certificate lists each class with its year and medium, and what it shows is only class history", () => {
    const { container } = sheet(bundle("study"));
    const rows = within(container.querySelector("tbody")!).getAllByRole("row").map((r) => r.textContent);
    expect(rows).toEqual(["2025-26Class 5 – ATelugu", "2026-27Class 6 – ATelugu"]);
  });
  it("no fee, marks or ID data is on any certificate", () => {
    for (const k of ["tc", "bonafide", "study"] as Kind[]) {
      const t = sheet(bundle(k), "both").container.textContent ?? "";
      expect(t).not.toMatch(/paise|₹|marks|aadhaar|udid|ration/i);
      cleanup();
    }
  });
  it("a preview has no number yet", () => {
    sheet(bundle("bonafide", { certificate: null }));
    expect(screen.getByText(/no number yet/)).toBeTruthy();
  });
});

const state = { needs_reason: false, copies: 1, last_language: "en" as const, has_telugu_name: true };
const panel = (b: Bundle, s = state, issuedNow = false) => render(<CertificatePrintPanel id="c1" initial={b} state={s} issuedNow={issuedNow} school={school} footer={FOOT} />);

describe("the print page", () => {
  it("right after issuing, the first print is the original: no reason, no new log entry", () => {
    panel(bundle("bonafide"), state, true);
    expect(screen.queryByTestId("duplicate-reason")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Print the original" }));
    expect(printAction).not.toHaveBeenCalled();
  });
  it("a later print needs a reason first, and shows DUPLICATE before printing", async () => {
    printAction.mockResolvedValue({ ok: true, bundle: bundle("bonafide", { duplicate: { is_duplicate: true, copy_no: 2, printed_at: "2026-10-20T05:00:00Z", reason: "lost", reason_note: null } }) });
    panel(bundle("bonafide"), { ...state, needs_reason: true });
    const btn = screen.getByRole("button", { name: "Print a duplicate" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(screen.getByTestId("duplicate-mark")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Reason for the duplicate"), { target: { value: "other" } });
    expect(btn.disabled).toBe(true);                                         // "other" needs a note
    fireEvent.change(screen.getByLabelText("Write the reason"), { target: { value: "Torn by rain" } });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    await waitFor(() => expect(printAction).toHaveBeenCalledWith("c1", "en", "other", "Torn by rain"));
    await waitFor(() => expect(window.print).toHaveBeenCalled(), { timeout: 1000 });
  });
  it("a refused print (the database said no) is not printed", async () => {
    printAction.mockResolvedValue({ ok: false, error: "Choose the reason for the duplicate" });
    panel(bundle("bonafide"), { ...state, needs_reason: true });
    fireEvent.change(screen.getByLabelText("Reason for the duplicate"), { target: { value: "lost" } });
    fireEvent.click(screen.getByRole("button", { name: "Print a duplicate" }));
    await waitFor(() => expect(printAction).toHaveBeenCalled());
    expect(window.print).not.toHaveBeenCalled();
  });
  it("Telugu or bilingual without a Telugu name is warned and blocked; English still prints", () => {
    const b = bundle("bonafide"); b.payload.student.name_te = null;
    panel(b, { ...state, has_telugu_name: false });
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "te" } });
    expect(screen.getByLabelText("Warnings").textContent).toMatch(/Telugu name not entered/);
    expect((screen.getByRole("button", { name: /Print/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Language"), { target: { value: "en" } });
    expect((screen.getByRole("button", { name: /Print/ }) as HTMLButtonElement).disabled).toBe(false);
  });
  it("a cancelled certificate cannot be printed", () => {
    panel(bundle("bonafide", { certificate: { id: "c1", number: "BON/1", status: "cancelled", issue_date: "2026-10-19", place: null, student_id: "s", cancel_reason: "Wrong student" } }));
    expect(screen.getByRole("alert").textContent).toMatch(/cancelled: Wrong student/);
    expect((screen.getByRole("button", { name: /Print/ }) as HTMLButtonElement).disabled).toBe(true);
  });
  it("a missing school detail is warned, with a link to fix it", () => {
    const b = bundle("bonafide"); b.school.missing = ["logo", "UDISE code"];
    panel(b);
    expect(screen.getByLabelText("Warnings").textContent).toMatch(/School details missing in Settings: logo, UDISE code/);
    expect((screen.getByRole("link", { name: "Fix in School settings" }) as HTMLAnchorElement).getAttribute("href")).toBe("/settings");
  });
});

describe("the TC checklist", () => {
  const items: CheckItem[] = [
    { key: "dues", label: "Fee dues are cleared", status: "fail", amount_paise: 1250000, detail: "Fees are still due", href: "/fees/collect?student=s1" },
    { key: "class_results", label: "In a class", status: "warn", detail: "not recorded", href: "/students/s1" },
    { key: "details", label: "Required details are complete", status: "ok", detail: "ok", href: "/students/s1/edit" },
  ];
  it("shows the amount and a Collect fee link on a red dues line", () => {
    render(<TcChecklist items={items} />);
    expect(screen.getByText(/₹12,500/)).toBeTruthy();
    expect((screen.getByRole("link", { name: "Collect fee" }) as HTMLAnchorElement).getAttribute("href")).toBe("/fees/collect?student=s1");
    expect(screen.getAllByRole("listitem").map((l) => l.getAttribute("data-status"))).toEqual(["fail", "warn", "ok"]);
  });
  it("only unpaid dues can be overridden", () => {
    expect(overrideState(items).canOverride).toBe(true);
    expect(overrideState([...items, { key: "details", label: "d", status: "fail", detail: "", href: "" }]).canOverride).toBe(false);
    expect(overrideState(items.slice(1)).red).toHaveLength(0);
  });
});

describe("cancel", () => {
  it("asks for a reason; after a year change it also asks for the class and section", async () => {
    cancelCheck.mockResolvedValue({ ok: true, check: { is_tc: true, needs_section: true, warning: "The student has no class in 2027-28.", status_changed_since: false } });
    cancelAction.mockResolvedValue({ ok: true });
    render(<CancelCertificate id="c1" number="TC/2026-27/001" sections={[{ id: "sec1", label: "Class 6 A" }]} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await screen.findByText(/no class in 2027-28/);
    const yes = screen.getByRole("button", { name: "Yes, cancel it" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Reason for cancelling"), { target: { value: "Issued to the wrong student" } });
    expect(yes.disabled).toBe(true);                                          // the section is still to be chosen
    fireEvent.change(screen.getByLabelText("Class and section to return to"), { target: { value: "sec1" } });
    expect(yes.disabled).toBe(false);
    fireEvent.click(yes);
    await waitFor(() => expect(cancelAction).toHaveBeenCalledWith("c1", "Issued to the wrong student", "sec1"));
  });
});

describe("issue form gates", () => {
  const issue = (kind: Kind, isAdmin = true) => render(<IssueForm kind={kind} today="2026-10-19" school={school} footer={FOOT} isAdmin={isAdmin} />);
  it("starts with finding the student: nothing else is shown", () => {
    issue("bonafide");
    expect(screen.getByLabelText("Search student")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Preview/ })).toBeNull();
  });
});

describe("settings", () => {
  const tpl = (kind: Kind, draft: boolean, checked: boolean): TemplateRow => ({ kind, title_en: "T", title_te: "T", layout_draft: draft, wording_confirmed: false, texts: { place: te("Place", "ప్రదేశం", checked), seal: te("Seal", "ముద్ర", checked) } });
  it("the TC draft switch needs a second click, and says what it means", () => {
    render(<DraftPanel templates={[tpl("tc", true, false), tpl("bonafide", true, false)]} />);
    expect(screen.getByText("DRAFT layout: issuing is blocked")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /switch the draft off/ }));
    expect(screen.getByText(/Only do this when the printout matches the real TC/)).toBeTruthy();
    expect(screen.getAllByText(/Draft wording, to be confirmed by the school/).length).toBe(2);
  });
  it("the starting number is locked once a certificate of that type exists this year", () => {
    render(<NumberingPanel prefixes={{ tc: "TC", bonafide: "BON", study: "STU" }} yearId="y" yearName="2026-27" series={[{ kind: "tc", next_no: 1, start_no: 1, issued: 0 }, { kind: "bonafide", next_no: 7, start_no: 1, issued: 6 }, { kind: "study", next_no: 1, start_no: 1, issued: 0 }]} />);
    expect((screen.getByLabelText("TC starting number") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText("Bonafide starting number") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Locked: 6 issued this year, next is 7/)).toBeTruthy();
  });
  it("every Telugu text starts as 'needs checking' and the count is shown", () => {
    render(<WordingPanel templates={[tpl("bonafide", true, false)]} />);
    expect(screen.getByText("2 Telugu text(s) need checking")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Bonafide certificate/ }));
    expect(screen.getByRole("button", { name: /A Telugu speaker has checked all of these/ })).toBeTruthy();
    expect(screen.getAllByText("Needs checking").length).toBe(2);
  });
});

describe("who sees the Certificates menu entry and page", () => {
  const page = findPage("/students/certificates")!;
  it("the Admin and an office person with the duty do; a teacher never does, even with the duty; office without the duty does not", () => {
    expect(page.status).toBe("built");
    expect(canOpenPage(page, { role: "admin", duties: [] })).toBe(true);
    expect(canOpenPage(page, { role: "computer_staff", duties: ["certificates_idcards"] })).toBe(true);
    expect(canOpenPage(page, { role: "teacher", duties: ["certificates_idcards", "student_records", "all_class_marks"] })).toBe(false);
    expect(canOpenPage(page, { role: "computer_staff", duties: ["student_records", "fee_collection"] })).toBe(false);
    const inMenu = (who: Parameters<typeof buildMenu>[0]) => buildMenu(who).some((g) => g.items.some((i) => i.path === "/students/certificates"));
    expect(inMenu({ role: "admin", duties: [] })).toBe(true);
    expect(inMenu({ role: "computer_staff", duties: ["certificates_idcards"] })).toBe(true);
    expect(inMenu({ role: "teacher", duties: ["certificates_idcards"] })).toBe(false);
  });
});
