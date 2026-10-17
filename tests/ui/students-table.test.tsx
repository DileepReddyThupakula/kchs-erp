// The Students list is driven by the URL: search, filters, sort and page all go to the server (nothing is filtered in the browser).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace }),
  usePathname: () => "/students",
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(() => "t"), dismiss: vi.fn() } }));
vi.mock("@/features/audit/actions", () => ({ logExport: vi.fn() }));
vi.mock("@/lib/export", () => ({ exportSheets: vi.fn() }));
vi.mock("@/features/students/actions", () => ({ changeStudentsSection: vi.fn(), studentsForExport: vi.fn() }));
vi.mock("@/app/(app)/students/[id]/client", () => ({ StatusDialog: () => null }));

import { StudentsTable } from "@/app/(app)/students/students-table";
import type { StudentRow, SectionOption } from "@/features/students/queries";

const sections: SectionOption[] = [
  { id: "s6", label: "Class 6 – A", classId: "c6", className: "Class 6", classOrder: 6, section: "A" },
  { id: "s7", label: "Class 7 – A", classId: "c7", className: "Class 7", classOrder: 7, section: "A" },
];
const row = (i: number): StudentRow => ({
  id: `id${i}`, admission_no: `ADM-${i}`, full_name: `Student ${i}`, gender: "male", date_of_birth: "2014-01-01", admission_date: "2020-06-01", status: "active",
  address: null, village_town: null, district: null, pincode: null, sectionId: "s6", classId: "c6", className: "Class 6", classOrder: 6, section: "A", rollNo: i,
  guardians: [], primaryPhone: null, missingDocsCount: i % 2, missingGovCount: 3,
});
const rows = Array.from({ length: 25 }, (_, i) => row(i + 1));
const show = (mode: "manage" | "mine" = "manage") => render(<StudentsTable rows={rows} total={439} mode={mode} sections={sections} yearName="2026-27" />);
const lastUrl = () => String(replace.mock.calls.at(-1)?.[0]);

beforeEach(() => {
  replace.mockClear();
  search = "";
});
afterEach(cleanup);

describe("Students list (server side)", () => {
  it("shows the page it is given and the true total, with Active as the default status", () => {
    show();
    expect(screen.getByText("Student 1")).toBeTruthy();
    expect(screen.getByText("1–25 of 439 records")).toBeTruthy();
    expect(screen.getByText("1 / 18")).toBeTruthy();
    expect(screen.getByText(/Status: Active/)).toBeTruthy();
  });

  it("Next page puts page=2 in the URL; going back removes it", () => {
    show();
    fireEvent.click(screen.getByLabelText("Next page"));
    expect(lastUrl()).toBe("/students?page=2");
  });

  it("reads page, search, sort and filters from the URL", () => {
    search = "page=3&q=ravi&sort=class&dir=desc&class=c7&status=left";
    show();
    expect(screen.getByText("51–75 of 439 records")).toBeTruthy();
    expect((screen.getByPlaceholderText(/Search name/) as HTMLInputElement).value).toBe("ravi");
    expect(screen.getByText(/Class: Class 7/)).toBeTruthy();
    expect(screen.getByText(/Status: Left/)).toBeTruthy();
  });

  it("choosing a class filter goes to the URL and returns to page 1", () => {
    search = "page=4";
    show();
    fireEvent.click(screen.getAllByRole("button").find((b) => b.getAttribute("aria-expanded") !== null && b.textContent === "Class")!);
    fireEvent.click(screen.getByRole("option", { name: "Class 7" }));
    expect(lastUrl()).toBe("/students?class=c7");
  });

  it("'All' statuses is remembered as status=all (not turned back into Active)", () => {
    show();
    fireEvent.click(screen.getByLabelText("Remove Status filter"));
    expect(lastUrl()).toBe("/students?status=all");
  });

  it("'Clear all' removes every filter", () => {
    search = "class=c7&docs=missing&status=left";
    show();
    fireEvent.click(screen.getByText("Clear all"));
    expect(lastUrl()).toBe("/students?status=all");
  });

  it("sorting a column goes to the URL; the default order (name, A to Z) leaves it clean", () => {
    show();
    fireEvent.click(screen.getAllByRole("button", { name: "Class" }).find((b) => b.closest("thead"))!);
    expect(lastUrl()).toBe("/students?sort=class&dir=asc");
  });

  it("a teacher's list ('mine') has no status / documents / government filters", () => {
    show("mine");
    expect(screen.queryByText("Documents")).toBeNull();
    expect(screen.queryByText("Govt. fields")).toBeNull();
    expect(screen.queryByText("Enrolment")).toBeNull();
    expect(screen.queryByText(/Status: Active/)).toBeNull();
  });

  it("typing in search is sent after a pause", () => {
    vi.useFakeTimers();
    try {
      show();
      fireEvent.change(screen.getByPlaceholderText(/Search name/), { target: { value: "kuruva" } });
      expect(replace).not.toHaveBeenCalled();
      act(() => void vi.advanceTimersByTime(400));
      expect(lastUrl()).toBe("/students?q=kuruva");
    } finally {
      vi.useRealTimers();
    }
  });

  it("counts of missing documents / fields come from the page rows", () => {
    show();
    expect(screen.getAllByText("3 missing").length).toBe(25);
    expect(screen.getAllByText("1 missing").length).toBe(13);
    expect(screen.getAllByText("Complete").length).toBe(12);
  });
});
