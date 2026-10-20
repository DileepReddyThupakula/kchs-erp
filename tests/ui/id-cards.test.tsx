// ID card screens: the layout rules, the card faces, the sheet (10 per A4, mirrored backs, cut marks), issue gates, lookup, replace/cancel, bulk photos, photo rules, menu.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, configure, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

configure({ asyncUtilTimeout: 5000 });   // generous: the test run is busy with browsers and databases at the same time

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => "/", useSearchParams: () => new URLSearchParams("") }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }));
const A = { lookup: vi.fn(), replace: vi.fn(), cancel: vi.fn(), plan: vi.fn(), cands: vi.fn(), preview: vi.fn(), issue: vi.fn(), print: vi.fn() };
vi.mock("@/features/id-cards/actions", () => ({
  lookupCard: (...a: unknown[]) => A.lookup(...a), replaceCard: (...a: unknown[]) => A.replace(...a), cancelCard: (...a: unknown[]) => A.cancel(...a), planPhotos: (...a: unknown[]) => A.plan(...a),
  loadCandidates: (...a: unknown[]) => A.cands(...a), previewCards: (...a: unknown[]) => A.preview(...a), issueCards: (...a: unknown[]) => A.issue(...a), printCards: (...a: unknown[]) => A.print(...a),
  recordPhoto: vi.fn(), logBulkPhotos: vi.fn(), exportRegister: vi.fn(), saveSettings: vi.fn(), loadSections: vi.fn(),
}));
vi.mock("@/lib/export", () => ({ exportSheets: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ storage: { from: () => ({ upload: vi.fn() }) } }) }));

import { CardBack, CardFront, QrSvg } from "@/components/id-cards/card-face";
import { CardSheet } from "@/components/id-cards/sheet";
import { IdCardPrintPanel } from "@/components/id-cards/print-panel";
import { eligible, IssueCardsForm } from "@/components/id-cards/issue-form";
import { FindByCardNumber } from "@/components/id-cards/find-card";
import { CardActions } from "@/components/id-cards/register-tools";
import { BulkPhotos } from "@/components/id-cards/bulk-photos";
import { IdCardSettingsPanel } from "@/components/id-cards/settings-panel";
import { cardSlot, chunk, CARD_H, CARD_W, fitName, MARGIN_X, MARGIN_Y, PER_SHEET, sheetOrder, type Bundle, type Candidate, type CardData } from "@/features/id-cards/shared";
import { imageSize } from "@/lib/image-size";
import { photoProblem } from "@/features/students/photo-rules";
import { buildMenu, canOpenPage, findPage } from "@/lib/site-map";

const school = { name: "Krishna Chaitanya High School", address: "Yerraguntla, YSR Kadapa", phone: "9985698213", logoUrl: "/logo.png" };
const card = (o: Partial<CardData> = {}): CardData => ({
  card_id: "c1", number: "ID/2026-27/0001", qr: "ID/2026-27/0001", status: "issued", year: "2026-27", name: "Ravi Kumar", name_te: "రవి కుమార్", class: "Class 6", section: "A", admission_no: "A-1",
  phone: "9000000001", blood_group: "O+", photo_path: "p/1.jpg", photo_pending: false, ...o,
});
const FOOT = "Printed on 20 Oct 2026 by Demo Admin · Confidential - for school use";
beforeEach(() => { Object.values(A).forEach((f) => f.mockReset()); window.print = vi.fn(); });
afterEach(cleanup);

describe("layout rules", () => {
  it("the card and the sheet: 86 x 54 mm, 2 x 5 = 10 on an A4 with equal margins", () => {
    expect([CARD_W, CARD_H, PER_SHEET]).toEqual([86, 54, 10]);
    expect(MARGIN_X * 2 + 2 * CARD_W).toBe(210);
    expect(MARGIN_Y * 2 + 5 * CARD_H).toBe(297);
  });
  it("the back sheet is mirrored left-right so each back lines up behind its front when printed double-sided", () => {
    for (let i = 0; i < PER_SHEET; i++) {
      const f = cardSlot(i, "front"), b = cardSlot(i, "back");
      expect(b.row).toBe(f.row);
      expect(b.x - MARGIN_X).toBe(CARD_W - (f.x - MARGIN_X));
    }
    expect(cardSlot(0, "front").x).toBe(19); expect(cardSlot(0, "back").x).toBe(105);
  });
  it("pages come out front, back, front, back", () => {
    expect(sheetOrder(23, "both").map((s) => `${s.sheet}${s.side[0]}`)).toEqual(["0f", "0b", "1f", "1b", "2f", "2b"]);
    expect(sheetOrder(3, "front")).toEqual([{ sheet: 0, side: "front" }]);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
  it("a long name shrinks to a minimum size and then wraps: never smaller than 6.5 pt, never cut", () => {
    expect(fitName("Ravi", 52)).toEqual({ pt: 10.5, wrap: false });
    const mid = fitName("Venkata Satya Narayana Reddy Gangireddy", 52);
    expect(mid.pt).toBeLessThan(10.5); expect(mid.pt).toBeGreaterThanOrEqual(6.5);
    const long = fitName("Bandi Venkata Satya Sai Narayana Reddy Gangireddy Subrahmanya Pradeep Kumar", 52);
    expect(long).toEqual({ pt: 6.5, wrap: true });
  });
});

describe("the front", () => {
  it("shows the name, class, admission number, year, card number and the photo; Telugu name only when saved", () => {
    const { container } = render(<CardFront card={card()} school={school} photoUrl="https://x/p.jpg" />);
    const t = container.textContent ?? "";
    expect(t).toContain("Ravi Kumar"); expect(t).toContain("Class 6 – A"); expect(t).toContain("A-1"); expect(t).toContain("2026-27"); expect(t).toContain("ID/2026-27/0001"); expect(t).toContain("Krishna Chaitanya High School");
    expect(screen.getByTestId("card-name-te").textContent).toBe("రవి కుమార్");
    expect(screen.getByTestId("card-photo").getAttribute("src")).toBe("https://x/p.jpg");
    cleanup();
    render(<CardFront card={card({ name_te: null })} school={school} photoUrl="u" />);
    expect(screen.queryByTestId("card-name-te")).toBeNull();                       // never a blank line, never a guess
  });
  it("nothing else is on the front: no phone, no blood group, no address", () => {
    const t = render(<CardFront card={card()} school={school} photoUrl="u" />).container.textContent ?? "";
    expect(t).not.toContain("9000000001"); expect(t).not.toMatch(/blood|O\+|phone|address|aadhaar/i);
  });
  it("a card issued without a photo shows the grey 'Photo pending' box", () => {
    render(<CardFront card={card({ photo_pending: true })} school={school} photoUrl={null} />);
    expect(screen.getByTestId("photo-pending").textContent).toBe("Photo pending");
  });
  it("a very long name stays inside its box: the smallest size is 6.5 pt", () => {
    render(<CardFront card={card({ name: "Bandi Venkata Satya Sai Narayana Reddy Gangireddy Subrahmanya Pradeep Kumar" })} school={school} photoUrl="u" />);
    expect(screen.getByTestId("card-name").style.fontSize).toBe("6.5pt");
  });
});

describe("the back", () => {
  it("blood group and phone only when present; the school's address and phone; 'If found'; a blank signature box (no image)", () => {
    const { container } = render(<CardBack card={card()} school={school} principal="Dr. Principal" />);
    expect(screen.getByTestId("back-phone").textContent).toContain("9000000001"); expect(screen.getByTestId("back-blood").textContent).toContain("O+");
    expect(container.textContent).toContain("If found, please return to the school"); expect(container.textContent).toContain("Yerraguntla, YSR Kadapa"); expect(container.textContent).toContain("Phone: 9985698213");
    expect(screen.getByTestId("signature-box").textContent).toContain("Signature of the Principal");
    expect(container.querySelector("img")).toBeNull();
    cleanup();
    render(<CardBack card={card({ phone: null, blood_group: null })} school={school} />);
    expect(screen.queryByTestId("back-phone")).toBeNull(); expect(screen.queryByTestId("back-blood")).toBeNull();
  });
  it("the QR holds exactly the card number and is at least 14 mm with a quiet border", () => {
    render(<CardBack card={card()} school={school} />);
    const q = screen.getByTestId("qr");
    expect(q.getAttribute("data-text")).toBe("ID/2026-27/0001");
    expect(parseFloat(q.getAttribute("width")!)).toBeGreaterThanOrEqual(14);
    const box = screen.getByTestId("qr-box");
    expect(parseFloat(box.style.width)).toBeGreaterThanOrEqual(parseFloat(q.getAttribute("width")!) + 4);
  });
  it("the QR of every card is its number and nothing else", () => {
    for (const n of ["ID/2026-27/0001", "ID/2026-27/0102"]) {
      const { unmount } = render(<QrSvg text={n} />);
      expect(screen.getByTestId("qr").getAttribute("data-text")).toBe(n);
      unmount();
    }
  });
  it("never shows an address, date of birth or ID number of the student", () => {
    const t = render(<CardBack card={card()} school={school} />).container.textContent ?? "";
    expect(t).not.toMatch(/village|district|born|dob|aadhaar|fee|marks|attendance/i);
  });
});

describe("the sheet", () => {
  const ten = Array.from({ length: 10 }, (_, i) => card({ card_id: `c${i}`, number: `ID/2026-27/${String(i + 1).padStart(4, "0")}`, qr: `ID/2026-27/${String(i + 1).padStart(4, "0")}`, name: `Student ${i + 1}` }));
  it("10 cards in 2 columns and 5 rows, each in its exact place", () => {
    const { container } = render(<CardSheet cards={ten} side="front" school={school} photos={{}} footer={FOOT} />);
    const slots = [...container.querySelectorAll("[data-slot]")] as HTMLElement[];
    expect(slots).toHaveLength(10);
    expect(slots[0].style.left).toBe("19mm"); expect(slots[1].style.left).toBe("105mm"); expect(slots[2].style.top).toBe("67.5mm");
    for (const s of slots) { expect(s.style.width).toBe("86mm"); expect(s.style.height).toBe("54mm"); }
    expect((container.querySelector("article") as HTMLElement).style.width).toBe("210mm");
    expect((container.querySelector("article") as HTMLElement).style.height).toBe("297mm");
  });
  it("on the back sheet card 1 is in the right-hand column (mirrored)", () => {
    const { container } = render(<CardSheet cards={ten} side="back" school={school} photos={{}} footer={FOOT} />);
    expect(([...container.querySelectorAll("[data-slot]")][0] as HTMLElement).style.left).toBe("105mm");
  });
  it("thin cut marks stay in the margins, never on a card", () => {
    const { container } = render(<CardSheet cards={ten} side="front" school={school} photos={{}} footer={FOOT} />);
    const marks = [...container.querySelectorAll("[data-mark]")] as HTMLElement[];
    expect(marks.length).toBe(18);                                  // 3 vertical cut lines x 2 ends + 6 horizontal cut lines x 2 ends
    for (const m of marks) {
      const left = parseFloat(m.style.left), top = parseFloat(m.style.top);
      const vertical = !!m.style.borderLeft;
      if (vertical) expect(top < MARGIN_Y || top >= 297 - MARGIN_Y).toBe(true);
      else expect(left < MARGIN_X || left >= 210 - MARGIN_X).toBe(true);
    }
  });
  it("the footer is printed on every sheet", () => {
    const { container } = render(<CardSheet cards={ten} side="front" school={school} photos={{}} footer={FOOT} />);
    expect(container.textContent).toContain(FOOT);
  });
});

const bundle = (cards: CardData[], missing: string[] = []): Bundle => ({ school: { name: "KCHS", address: "", udise_code: null, affiliation_no: null, logo_path: null, principal_name: "Dr. P", missing }, settings: { show_phone: true, show_blood_group: true }, cards });
describe("the print page", () => {
  const panel = (issuedNow: boolean, b = bundle([card()])) => render(<IdCardPrintPanel ids={["c1"]} bundle={b} photos={{}} issuedNow={issuedNow} school={school} footer={FOOT} />);
  it("right after issuing, the first print needs no check; the sheets are front then back", async () => {
    panel(true);
    expect(screen.getAllByTestId(/sheet-/).map((s) => s.getAttribute("data-testid"))).toEqual(["sheet-front", "sheet-back"]);
    fireEvent.click(screen.getByRole("button", { name: "Print the cards" }));
    expect(A.print).not.toHaveBeenCalled();
    await waitFor(() => expect(window.print).toHaveBeenCalledTimes(1));           // the browser's print window opens (and its timer is done before the next test starts)
  });
  it("a later print goes through the database; a refusal is shown with the way out (replace the card)", async () => {
    A.print.mockResolvedValue({ ok: false, error: "These cards were printed more than 10 minutes ago, or by someone else." });
    panel(false);
    fireEvent.click(screen.getByRole("button", { name: "Print the same sheets again" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/more than 10 minutes/));
    expect((screen.getByRole("link", { name: /replace a card/ }) as HTMLAnchorElement).getAttribute("href")).toBe("/students/id-cards/register");
    expect(window.print).not.toHaveBeenCalled();
  });
  it("fronts only / backs only; a missing school detail is warned", () => {
    panel(true, bundle([card()], ["logo"]));
    expect(screen.getByRole("status").textContent).toMatch(/School details missing in Settings: logo/);
    fireEvent.change(screen.getByLabelText("Which sides"), { target: { value: "front" } });
    expect(screen.getAllByTestId(/sheet-/)).toHaveLength(1);
  });
  it("26 cards need 3 sheets of fronts and 3 of backs", () => {
    panel(true, bundle(Array.from({ length: 26 }, (_, i) => card({ card_id: `c${i}`, number: `ID/2026-27/${i + 1}` }))));
    expect(screen.getAllByTestId(/sheet-/)).toHaveLength(6);
  });
});

const cand = (o: Partial<Candidate>): Candidate => ({ student_id: "s1", name: "Ravi", admission_no: "A-1", class: "Class 6", section: "A", roll_no: 1, status: "active", has_photo: true, photo_path: "p", card_number: null, card_id: null, problem: null, ...o });
describe("issuing", () => {
  const sections = [{ id: "sec1", label: "Class 6 A", class_id: "c6", class: "Class 6", students: 3 }];
  it("who can be issued: a clean student; a student without a photo only for the Admin with a written reason", () => {
    expect(eligible(cand({}), {}, false)).toBe(true);
    expect(eligible(cand({ problem: "No photo", has_photo: false }), {}, true)).toBe(false);
    expect(eligible(cand({ problem: "No photo", has_photo: false }), { s1: "ab" }, true)).toBe(false);
    expect(eligible(cand({ problem: "No photo", has_photo: false }), { s1: "Photo comes Monday" }, true)).toBe(true);
    expect(eligible(cand({ problem: "No photo", has_photo: false }), { s1: "Photo comes Monday" }, false)).toBe(false);
    expect(eligible(cand({ problem: "Student has left" }), { s1: "reason reason" }, true)).toBe(false);
    expect(eligible(cand({ problem: "Already has a card" }), {}, true)).toBe(false);
  });
  it("lists the skipped students with the reason, counts the sheets, and issues only the chosen ones", async () => {
    A.cands.mockResolvedValue({ ok: true, rows: [cand({ student_id: "a", name: "Anu" }), cand({ student_id: "b", name: "Bala", problem: "No photo", has_photo: false }), cand({ student_id: "c", name: "Chitra", problem: "Student has left" }), cand({ student_id: "d", name: "Dev", problem: "Already has a card", card_number: "ID/2026-27/0001" })] });
    A.preview.mockResolvedValue({ ok: true, bundle: bundle([card()]), photos: {} });
    A.issue.mockResolvedValue({ ok: true, batchId: "b1", issued: [{}], skipped: [] });
    render(<IssueCardsForm sections={sections} school={school} footer={FOOT} isAdmin={false} />);
    fireEvent.change(screen.getByLabelText("Section or class"), { target: { value: "s:sec1" } });
    await screen.findByText("Anu");
    expect(screen.getByTestId("summary").textContent).toBe("1 card to issue on 1 sheet of 10 (2 across, 5 down).");
    const skipped = within(screen.getByTestId("skipped")).getAllByRole("listitem").map((l) => l.textContent);
    expect(skipped).toEqual(["Bala: No photo (add a photo first)", "Chitra: Student has left", "Dev: Already has a card"]);
    expect(screen.queryByLabelText(/Reason to issue Bala/)).toBeNull();                      // only the Admin may override
    await waitFor(() => expect(A.preview).toHaveBeenCalledWith(["a"]));
    await waitFor(() => expect((screen.getByRole("button", { name: "Issue 1 card" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Issue 1 card" }));
    await waitFor(() => expect(A.issue).toHaveBeenCalledWith(["a"], {}));
  });
  it("the Admin can give a reason and so include a student without a photo", async () => {
    A.cands.mockResolvedValue({ ok: true, rows: [cand({ student_id: "b", name: "Bala", problem: "No photo", has_photo: false })] });
    A.preview.mockResolvedValue({ ok: true, bundle: bundle([card()]), photos: {} });
    A.issue.mockResolvedValue({ ok: true, batchId: "b1", issued: [{}], skipped: [] });
    render(<IssueCardsForm sections={sections} school={school} footer={FOOT} isAdmin />);
    fireEvent.change(screen.getByLabelText("Section or class"), { target: { value: "s:sec1" } });
    await screen.findByText("Bala");
    expect((screen.getByRole("button", { name: /Issue 0 cards/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/Reason to issue Bala/), { target: { value: "Photo comes Monday" } });
    await waitFor(() => expect((screen.getByRole("button", { name: "Issue 1 card" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Issue 1 card" }));
    await waitFor(() => expect(A.issue).toHaveBeenCalledWith(["b"], { b: "Photo comes Monday" }));
  });
});

describe("find by card number", () => {
  it("a cancelled card is a clear red warning with the reason and the replacement", async () => {
    A.lookup.mockResolvedValue({ ok: true, result: { found: true, number: "ID/2026-27/0001", status: "cancelled", cancel_kind: "lost", cancel_reason: "lost", name: "Ravi", admission_no: "A-1", replaced_by: "ID/2026-27/0007" } });
    render(<FindByCardNumber canOpenStudent />);
    fireEvent.change(screen.getByLabelText("Card number"), { target: { value: "ID/2026-27/0001" } });
    fireEvent.click(screen.getByRole("button", { name: /Find/ }));
    const a = await screen.findByRole("alert");
    expect(a.textContent).toMatch(/Cancelled: do not accept this card/); expect(a.textContent).toMatch(/Replaced by ID\/2026-27\/0007/);
    expect(a.className).toMatch(/red/);
  });
  it("a valid card, and a number nobody has", async () => {
    A.lookup.mockResolvedValueOnce({ ok: true, result: { found: true, number: "ID/2026-27/0002", status: "issued", year: "2026-27", student_id: "s", name: "Bala", admission_no: "A-2", class: "Class 6 A", student_status: "active" } });
    render(<FindByCardNumber canOpenStudent={false} />);
    fireEvent.change(screen.getByLabelText("Card number"), { target: { value: "ID/2026-27/0002" } });
    fireEvent.click(screen.getByRole("button", { name: /Find/ }));
    expect((await screen.findByTestId("lookup-valid")).textContent).toMatch(/Valid card ID\/2026-27\/0002/);
    expect(screen.queryByRole("link", { name: "Open the student" })).toBeNull();           // a duty holder cannot open the student record
    A.lookup.mockResolvedValueOnce({ ok: true, result: { found: false } });
    fireEvent.change(screen.getByLabelText("Card number"), { target: { value: "ID/NOPE/1" } });
    fireEvent.click(screen.getByRole("button", { name: /Find/ }));
    expect(await screen.findByText("No card has this number.")).toBeTruthy();
  });
});

describe("replace and cancel", () => {
  it("replace needs a reason (and a note for 'other'); cancel is for the Admin only and needs a reason", async () => {
    A.replace.mockResolvedValue({ ok: true, cardId: "n", number: "ID/2026-27/0009" });
    render(<CardActions id="c1" number="ID/2026-27/0001" isAdmin={false} noPhoto={false} />);
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    const go = screen.getByRole("button", { name: "Replace the card" }) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Reason"), { target: { value: "other" } });
    expect(go.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Write the reason"), { target: { value: "Torn in the rain" } });
    expect(go.disabled).toBe(false);
    fireEvent.click(go);
    await waitFor(() => expect(A.replace).toHaveBeenCalledWith("c1", "other", "Torn in the rain", ""));
  });
  it("the Admin cancels with a reason", async () => {
    A.cancel.mockResolvedValue({ ok: true });
    render(<CardActions id="c1" number="ID/2026-27/0001" isAdmin noPhoto={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    const yes = screen.getByRole("button", { name: "Yes, cancel it" }) as HTMLButtonElement;
    expect(yes.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Reason for cancelling"), { target: { value: "Issued by mistake" } });
    fireEvent.click(yes);
    await waitFor(() => expect(A.cancel).toHaveBeenCalledWith("c1", "Issued by mistake"));
  });
});

describe("replacing a card that has a pending photo", () => {
  it("the reason and the 'why no photo' note are kept apart", async () => {
    A.replace.mockResolvedValue({ ok: true, cardId: "n", number: "ID/2026-27/0009" });
    render(<CardActions id="c1" number="ID/2026-27/0001" isAdmin noPhoto />);
    fireEvent.click(screen.getByRole("button", { name: "Replace" }));
    const go = screen.getByRole("button", { name: "Replace the card" }) as HTMLButtonElement;
    expect(go.disabled).toBe(true);                                                  // the pending reason is needed
    fireEvent.change(screen.getByLabelText("Why the card has no photo"), { target: { value: "Photo will arrive" } });
    fireEvent.click(go);
    await waitFor(() => expect(A.replace).toHaveBeenCalledWith("c1", "lost", "", "Photo will arrive"));
  });
});

describe("bulk photos", () => {
  it("shows what is ready and every problem before anything is saved", async () => {
    A.plan.mockResolvedValue({ ok: true, rows: [
      { name: "CI-01.jpg", admission_no: "CI-01", student_id: "s1", student: "Anu", class: "Class 6 A", status: "ok", problem: null, replaces: false },
      { name: "CI-02.jpg", admission_no: "CI-02", student_id: "s2", student: "Bala", class: "Class 6 A", status: "problem", problem: "The photo is too small: it must be at least 300 x 400 pixels.", replaces: false },
      { name: "XX-99.jpg", admission_no: "XX-99", student_id: null, student: null, class: null, status: "no_match", problem: null, replaces: false },
      { name: "CI-06.jpg", admission_no: "CI-06", student_id: "s6", student: "Left Boy", class: "Class 6 A", status: "student_left", problem: null, replaces: true },
    ] });
    vi.stubGlobal("createImageBitmap", async () => ({ width: 600, height: 800, close() {} }));
    render(<BulkPhotos sections={[]} />);
    const file = new File([new Uint8Array(10)], "CI-01.jpg", { type: "image/jpeg" });
    fireEvent.change(screen.getByLabelText("Photos"), { target: { files: [file] } });
    await screen.findByTestId("plan-summary");
    expect(screen.getByTestId("plan-summary").textContent).toBe("1 ready to save · 3 with a problem (these will not be saved)");
    const items = within(screen.getByLabelText("Problems")).getAllByRole("listitem").map((l) => l.textContent);
    expect(items[0]).toMatch(/CI-02.jpg: Photo problem \(The photo is too small/);
    expect(items[1]).toMatch(/XX-99.jpg: No student has this admission number/);
    expect(items[2]).toMatch(/CI-06.jpg: The student has left/);
    expect(screen.getByRole("button", { name: "Save 1 photo" })).toBeTruthy();
    vi.unstubAllGlobals();
  });
});

describe("the photo rules (the same as the database's)", () => {
  it("JPEG or PNG, 300 x 400 or more, at most 5 MB, passport shape", () => {
    expect(photoProblem(300, 400, 1000, "image/jpeg")).toBeNull();
    expect(photoProblem(299, 400, 1000, "image/jpeg")).toMatch(/too small/);
    expect(photoProblem(600, 800, 5 * 1024 * 1024 + 1, "image/png")).toMatch(/5 MB/);
    expect(photoProblem(600, 800, 1000, "image/webp")).toMatch(/JPEG or PNG/);
    expect(photoProblem(1600, 800, 1000, "image/jpeg")).toMatch(/wrong shape/);
  });
  it("reads the size of a PNG and a JPEG from the header", () => {
    const png = new Uint8Array(32); png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); new DataView(png.buffer).setUint32(16, 600); new DataView(png.buffer).setUint32(20, 800);
    expect(imageSize(png)).toEqual({ width: 600, height: 800, type: "png" });
    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x03, 0x20, 0x02, 0x58, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(imageSize(jpg)).toEqual({ width: 600, height: 800, type: "jpeg" });
    expect(imageSize(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull();
  });
});

describe("settings and who sees the menu", () => {
  it("the two switches and the prefix; the page says what the card never shows", () => {
    render(<IdCardSettingsPanel prefix="ID" showPhone showBlood year="2026-27" />);
    expect((screen.getByLabelText(/One parent phone number/) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText(/never shows a home address, date of birth, government ID/)).toBeTruthy();
    expect(screen.getByText(/tell parents what the card carries/)).toBeTruthy();
  });
  it("the Admin and an office person with the duty see it; a teacher never does, even with the duty; no 'Soon' label", () => {
    const page = findPage("/students/id-cards")!;
    expect(page.status).toBe("built");
    expect(canOpenPage(page, { role: "admin", duties: [] })).toBe(true);
    expect(canOpenPage(page, { role: "computer_staff", duties: ["certificates_idcards"] })).toBe(true);
    expect(canOpenPage(page, { role: "teacher", duties: ["certificates_idcards", "student_records"] })).toBe(false);
    expect(canOpenPage(page, { role: "computer_staff", duties: ["student_records"] })).toBe(false);
    const inMenu = (who: Parameters<typeof buildMenu>[0]) => buildMenu(who).flatMap((g) => g.items).filter((i) => i.path === "/students/id-cards" && i.status !== "planned").length === 1;
    expect(inMenu({ role: "admin", duties: [] })).toBe(true);
    expect(inMenu({ role: "computer_staff", duties: ["certificates_idcards"] })).toBe(true);
    expect(inMenu({ role: "teacher", duties: ["certificates_idcards"] })).toBe(false);
  });
});
