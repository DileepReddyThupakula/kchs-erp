// Reports (screens): who sees which report, how numbers are shown, the print footer, and that no report can be shared.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => "/reports/strength", useSearchParams: () => new URLSearchParams() }));
vi.mock("@/features/audit/actions", () => ({ logExport: vi.fn(), logReport: vi.fn() }));
vi.mock("@/lib/export", () => ({ exportSheets: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { cellText, exportCell, hubFor, printFooterText, totalsRow, REPORT_PAGE, type ReportData } from "@/features/reports/shared";
import { canOpenPage, findPage, buildMenu } from "@/lib/site-map";
import { ReportView } from "@/components/reports/report-view";
import { ReportPrintSheet } from "@/components/attendance/print-sheet";
import type { Duty } from "@/lib/auth/permissions";

const teacher = { role: "teacher" as const, duties: ["student_records", "all_class_attendance", "all_class_marks", "notices_diary", "timetable_edit", "certificates_idcards", "government_ids_view"] as Duty[] };
const teacherWithStrayFee = { role: "teacher" as const, duties: ["fee_collection", "student_records"] as Duty[] };
const officeNoFee = { role: "computer_staff" as const, duties: ["student_records"] as Duty[] };
const officeFee = { role: "computer_staff" as const, duties: ["fee_collection"] as Duty[] };
const admin = { role: "admin" as const, duties: [] as Duty[] };
const ids = (w: Parameters<typeof hubFor>[0]) => hubFor(w).map((h) => h.id);
afterEach(cleanup);

const data: ReportData = {
  id: "fee-monthly", title: "Fee collection by month", subtitle: "Academic year 2026-27",
  columns: [{ key: "month", header: "Month", kind: "month" }, { key: "receipts", header: "Receipts", kind: "int", total: true }, { key: "collected", header: "Collected", kind: "money", total: true }],
  rows: [{ month: "2026-06-01", receipts: 3, collected: 150000 }, { month: "2026-07-01", receipts: 2, collected: 1234500 }],
  note: "Cancelled receipts are not counted.",
};

describe("report numbers", () => {
  it("shows Indian formats on screen and plain numbers in Excel", () => {
    expect(cellText("money", 1234500)).toBe("₹12,345");
    expect(cellText("int", 1234567)).toBe("12,34,567");
    expect(cellText("pct", 72.345)).toBe("72.3%");
    expect(cellText("month", "2026-06-01")).toMatch(/June 2026/);
    expect(cellText("text", null)).toBe("—");
    expect(exportCell("money", 150000)).toBe(1500);
    expect(exportCell("int", "7")).toBe(7);
    expect(exportCell("month", "2026-06-01")).toBe("2026-06");
  });
  it("adds up only the columns marked total", () => {
    expect(totalsRow(data)).toEqual({ month: "Total", receipts: 5, collected: 1384500 });
    expect(totalsRow({ ...data, rows: [] })).toBeNull();
  });
});

describe("who sees which report", () => {
  it("a teacher, even with every other duty: no fee report anywhere in the hub", () => {
    const list = ids(teacher);
    expect(list.some((i) => i.startsWith("fee"))).toBe(false);
    expect(list).toContain("strength");
    expect(list).toContain("exam-summary");
    expect(list).toContain("my-load");
    expect(list).not.toContain("staff-att-summary");
    expect(list).not.toContain("gov");
  });
  it("a teacher with a stray fee duty still sees no fee report", () => {
    expect(ids(teacherWithStrayFee).some((i) => i.startsWith("fee"))).toBe(false);
  });
  it("office staff without fee access: no fee report; with it: all of them", () => {
    expect(ids(officeNoFee).some((i) => i.startsWith("fee"))).toBe(false);
    expect(ids(officeNoFee)).toContain("demographics"); // they hold student_records
    expect(ids(officeFee)).toEqual(expect.arrayContaining(["fee-summary", "fee-collection", "fee-dues", "fee-receipts"]));
    expect(ids(officeFee)).not.toContain("fee-concessions"); // the concessions page is Admin only
    expect(ids(officeFee)).not.toContain("demographics");
  });
  it("the Admin sees everything except the personal 'my load'", () => {
    const a = ids(admin);
    expect(a).toEqual(expect.arrayContaining(["strength", "demographics", "admissions", "fee-summary", "fee-dues", "staff-att-summary", "exam-summary", "att", "gov"]));
    expect(a).not.toContain("my-load");
  });
  it("the reports that already had a screen are linked, not rebuilt", () => {
    const existing = hubFor(admin).filter((h) => h.existing).map((h) => h.href);
    expect(existing).toEqual(expect.arrayContaining(["/attendance/reports", "/fees/reports", "/fees/dues", "/fees/receipts", "/exams/report-cards", "/exams/results"]));
  });
  it("the pages follow the same rule as the hub (the fee page is closed to teachers and to office staff without access)", () => {
    const fees = findPage("/reports/fees")!;
    expect(canOpenPage(fees, admin)).toBe(true);
    expect(canOpenPage(fees, officeFee)).toBe(true);
    expect(canOpenPage(fees, officeNoFee)).toBe(false);
    expect(canOpenPage(fees, teacher)).toBe(false);
    expect(canOpenPage(fees, teacherWithStrayFee)).toBe(false);
    expect(canOpenPage(findPage("/reports/staff")!, teacher)).toBe(false);
    expect(canOpenPage(findPage("/reports/staff")!, officeFee)).toBe(false);
    expect(canOpenPage(findPage("/reports")!, teacher)).toBe(true);
  });
  it("every report id maps to a page that exists", () => {
    for (const p of Object.values(REPORT_PAGE)) expect(findPage(p)).toBeTruthy();
  });
  it("the menu never lists a fee page for a teacher or for office staff without access", () => {
    const flat = (w: Parameters<typeof buildMenu>[0]) => buildMenu(w).flatMap((g) => g.items.map((i) => `${i.path} ${i.name}`)).join(" | ").toLowerCase();
    for (const w of [teacher, teacherWithStrayFee, officeNoFee]) {
      const m = flat(w);
      expect(m).not.toContain("/fees");
      expect(m).not.toContain("fee summary");
    }
    expect(flat(officeFee)).toContain("/fees/dues");
  });
});

describe("a report on screen", () => {
  it("shows the rows, the totals and the note, and prints to its own page", () => {
    render(<ReportView data={data} printHref="/print/report/fee-monthly?year=1" filters={{ year: "2026-27" }} />);
    expect(screen.getByText("₹12,345")).toBeTruthy();
    expect(screen.getByLabelText("Totals").textContent).toMatch(/Total.*Receipts: 5.*Collected: ₹13,845/);
    expect(screen.getByText("Cancelled receipts are not counted.")).toBeTruthy();
    const print = screen.getByRole("link", { name: /Print/ });
    expect(print.getAttribute("href")).toBe("/print/report/fee-monthly?year=1");
  });
  it("has an Export button but NO share, copy or WhatsApp button or link", () => {
    render(<ReportView data={data} printHref="/p" filters={{}} />);
    expect(screen.getByRole("button", { name: /Export/ })).toBeTruthy();
    const all = [...screen.queryAllByRole("button"), ...screen.queryAllByRole("link")].map((e) => (e.textContent ?? "") + (e.getAttribute("aria-label") ?? "") + (e.getAttribute("href") ?? ""));
    expect(all.join(" ")).not.toMatch(/whatsapp|wa\.me|share|copy/i);
  });
});

describe("printing", () => {
  const school = { name: "KRISHNA CHAITANYA HIGH SCHOOL", address: "Yerraguntla", phone: null, logoUrl: "/x.png" };
  it("every printed list carries the date, who printed it and the confidential line", () => {
    const footer = printFooterText("19 Oct 2026", "Demo Admin");
    expect(footer).toBe("Printed on 19 Oct 2026 by Demo Admin · Confidential - for school use");
    render(<ReportPrintSheet school={school} title="STRENGTH" subtitle="2026-27" headers={["Class", "Active"]} rows={[["Class 6", 37]]} footer={footer} />);
    expect(screen.getByTestId("print-footer").textContent).toBe(footer);
  });
  it("the footer is a table footer, which the browser repeats at the bottom of every printed page without covering rows", () => {
    const { container } = render(<ReportPrintSheet school={school} title="T" subtitle="s" headers={["a"]} rows={[]} footer="f" />);
    const css = container.querySelector("style")!.textContent!;
    expect(css).toMatch(/tfoot\s*{\s*display:\s*table-footer-group/);
    expect(css).toMatch(/size:\s*A4 landscape/);
    expect(container.querySelector("tfoot [data-testid=print-footer]")).toBeTruthy();
  });
  it("Telugu text prints as text (not an image) and the page fits A4", () => {
    const { container } = render(<ReportPrintSheet school={school} title="T" subtitle="s" headers={["సబ్జెక్టు"]} rows={[["గణితం"]]} footer="f" />);
    expect(screen.getByText("గణితం")).toBeTruthy();
    expect(container.querySelector("article")!.getAttribute("style")).toMatch(/width:\s*277mm/); // A4 landscape 297mm minus 2 x 10mm margin
  });
});
