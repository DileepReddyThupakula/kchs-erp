// Promotion screens: totals, checklist, per-student and whole-section choices, the Confirm gate, the Undo notice, the plain note, and who may open the page.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { Checklist, SummaryBlock, TotalsTable, UndoNotice, WhatConfirmDoes } from "@/components/promotion/parts";
import { StudentTable } from "@/components/promotion/student-table";
import { ConfirmBox } from "@/components/promotion/confirm-box";
import { UndoCard } from "@/components/promotion/undo-card";
import { buildPlan, canPressConfirm, emptyEdits, groupBySection, nextYearSum, setMany, setSection, setStudent, type CheckItem, type ClassTotals, type Preview, type RunInfo, type StudentRow } from "@/features/promotion/shared";
import { canOpenPage, findPage } from "@/lib/site-map";

afterEach(cleanup);

const cls = (o: Partial<ClassTotals>): ClassTotals => ({ class_id: "c", class: "Class 5", sort_order: 5, last_year: 40, left_midyear: 2, promoted_out: 37, detained: 2, passed_out: 0, left: 1, promoted_in: 38, detained_in: 2, new_in: 3, next_year: 43, ...o });
const stu = (o: Partial<StudentRow>): StudentRow => ({
  student_id: "s1", name: "Ravi", admission_no: "A-1", gender: "male", from_class_id: "c5", from_class: "Class 5", from_section_id: "sec5a", from_section: "A", from_roll: 3,
  outcome: "promote", suggested_detain: false, is_new: false, to_class_id: "c6", to_class: "Class 6", to_section: "A", to_roll: 4, dues_paise: 0, problem: null, ...o,
});
const checks: CheckItem[] = [
  { key: "new_year", label: "The new academic year exists and is next", status: "ok", detail: "2026-27 → 2027-28", href: "/setup/academic-years" },
  { key: "fee_structure", label: "The new year's fee structure is set", status: "fail", detail: "No fees set for: Class 6", href: "/fees/setup" },
  { key: "results_locked", label: "Old-year results are locked", status: "warn", detail: "2 result(s) are not locked yet", href: "/exams/locks" },
];
const preview = (o: Partial<Preview> = {}): Preview => ({
  from_year: { id: "y1", name: "2026-27" }, to_year: { id: "y2", name: "2027-28" }, max_size: 40, roll_order: "alpha",
  summary: { students_total: 100, promoted: 90, promoted_by_class: [{ class: "Class 6", count: 38 }, { class: "Class 7", count: 52 }], detained: 4, passed_out: 5, left: 1, new_admissions: 3, left_midyear: 2, new_sections_created: 6, carried_dues_paise: 1234500, carried_dues_students: 12, leavers_dues_paise: 0, assignments_to_copy: 14 },
  classes: [cls({})], sections: [], students: [stu({})], checklist: [checks[0]], can_confirm: true, ...o,
});

describe("totals per class", () => {
  it("shows last year, moving up, repeating, leaving, new and next year, with the sum behind each next-year number", () => {
    render(<TotalsTable classes={[cls({}), cls({ class_id: "x", class: "Empty", last_year: 0, next_year: 0, left_midyear: 0 })]} />);
    const row = within(screen.getByRole("row", { name: /Class 5/ }));
    expect(row.getByText("40")).toBeTruthy();
    expect(row.getByText("43").getAttribute("title")).toBe("38 moving up + 2 repeating + 3 new = 43");
    expect(screen.queryByText("Empty")).toBeNull();
    expect(nextYearSum(cls({}))).toBe("38 moving up + 2 repeating + 3 new = 43");
  });
});

describe("checklist", () => {
  it("shows green, red and amber items; only red and amber have a link, to fix it", () => {
    render(<Checklist items={checks} />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((i) => i.getAttribute("data-status"))).toEqual(["ok", "fail", "warn"]);
    expect(within(items[0]).queryByRole("link")).toBeNull();
    expect((within(items[1]).getByRole("link", { name: "Fix this" }) as HTMLAnchorElement).getAttribute("href")).toBe("/fees/setup");
    expect(within(items[1]).getByLabelText("Red")).toBeTruthy();
    expect(within(items[0]).getByLabelText("Green")).toBeTruthy();
  });
});

describe("final summary and the plain note", () => {
  it("lists promoted per class, detained, leavers, new sections and the carried-over dues total", () => {
    render(<SummaryBlock s={preview().summary} toName="2027-28" />);
    const t = screen.getByLabelText("Summary before you confirm").textContent ?? "";
    expect(t).toContain("90 students");
    expect(t).toContain("38 to Class 6, 52 to Class 7");
    expect(t).toContain("6 (5 passed out, 1 left)");
    expect(t).toMatch(/New sections created in 2027-28\s*6/);
    expect(t).toContain("₹12,345");
  });
  it("explains what Confirm does and what it never does, in plain words", () => {
    render(<WhatConfirmDoes from="2026-27" to="2027-28" />);
    expect(screen.getByText(/Confirm will never/)).toBeTruthy();
    expect(screen.getByText(/delete or change anything from 2026-27/)).toBeTruthy();
    expect(screen.getByText(/copy fee concessions/)).toBeTruthy();
    expect(screen.getByText(/undo it until anything is recorded in 2027-28/)).toBeTruthy();
  });
});

describe("student choices", () => {
  it("changes one student, and a whole section at once", () => {
    const onOutcome = vi.fn(), onMany = vi.fn();
    render(<StudentTable rows={[stu({}), stu({ student_id: "s2", name: "Sita" })]} onOutcome={onOutcome} onSection={vi.fn()} onRoll={vi.fn()} onMany={onMany} />);
    fireEvent.change(screen.getByLabelText("What happens to Ravi"), { target: { value: "detain" } });
    expect(onOutcome).toHaveBeenCalledWith("s1", "detain");
    fireEvent.change(screen.getByLabelText(/Set the whole section Class 5 – A/), { target: { value: "left" } });
    expect(onMany).toHaveBeenCalledWith(["s1", "s2"], "left");
  });
  it("tells the Admin when a student failed a locked result, but never decides for them", () => {
    render(<StudentTable rows={[stu({ suggested_detain: true })]} onOutcome={vi.fn()} onSection={vi.fn()} onRoll={vi.fn()} onMany={vi.fn()} />);
    expect(screen.getByText(/Failed a locked result: consider detaining/)).toBeTruthy();
    expect((screen.getByLabelText("What happens to Ravi") as HTMLSelectElement).value).toBe("promote");
  });
  it("new admissions are listed apart, with no choice to make; leavers show 'Leaves school'", () => {
    render(<StudentTable rows={[stu({ outcome: "passed_out", to_class: null, to_class_id: null, to_section: null, to_roll: null }), stu({ student_id: "n1", name: "Newbie", outcome: "new", is_new: true, from_class: null, from_section: null })]} onOutcome={vi.fn()} onSection={vi.fn()} onRoll={vi.fn()} onMany={vi.fn()} />);
    expect(screen.getByText(/New admissions \(already placed/)).toBeTruthy();
    expect(screen.getByText("New admission")).toBeTruthy();
    expect(screen.getByText("Leaves school")).toBeTruthy();
    expect(screen.queryByLabelText("What happens to Newbie")).toBeNull();
  });
  it("a student who cannot be placed is shown in red with the reason", () => {
    render(<StudentTable rows={[stu({ problem: "There is no next class: choose detain or passed out" })]} onOutcome={vi.fn()} onSection={vi.fn()} onRoll={vi.fn()} onMany={vi.fn()} />);
    expect(screen.getByRole("alert").textContent).toContain("There is no next class");
  });
});

describe("the plan sent to the database", () => {
  it("only real changes are sent", () => {
    let e = emptyEdits();
    expect(buildPlan(e)).toEqual({ max_size: 40, roll_order: "alpha", copy_assignments: true, students: {}, sections: {} });
    e = setStudent(e, "s1", { outcome: "detain" });
    e = setStudent(e, "s1", { to_section: "B", roll_no: 9 });
    e = setMany(e, ["s2", "s3"], "left");
    e = setSection(e, "c6:A", { medium: "Telugu", class_teacher_id: null });
    expect(buildPlan(e)).toMatchObject({
      students: { s1: { outcome: "detain", to_section: "B", roll_no: 9 }, s2: { outcome: "left" }, s3: { outcome: "left" } },
      sections: { "c6:A": { medium: "Telugu", class_teacher_id: null } },
    });
  });
  it("groups students by the section they come from, new admissions last", () => {
    const g = groupBySection([stu({}), stu({ student_id: "n", is_new: true, from_section_id: null }), stu({ student_id: "s3" })]);
    expect(g.map((x) => x.key)).toEqual(["sec5a", "new"]);
    expect(g[0].rows).toHaveLength(2);
  });
});

describe("Confirm needs a green checklist, the tick and the typed year name", () => {
  it("rule", () => {
    const p = preview();
    expect(canPressConfirm(p, true, "2027-28")).toBe(true);
    expect(canPressConfirm(p, true, "  2027-28 ")).toBe(true);
    expect(canPressConfirm(p, false, "2027-28")).toBe(false);
    expect(canPressConfirm(p, true, "2027")).toBe(false);
    expect(canPressConfirm(preview({ can_confirm: false, checklist: checks }), true, "2027-28")).toBe(false);
  });
  it("the button stays disabled until the tick and the name are both right", () => {
    const onConfirm = vi.fn();
    render(<ConfirmBox preview={preview()} busy={false} onConfirm={onConfirm} />);
    const btn = screen.getByRole("button", { name: /Confirm: start 2027-28/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("I have checked the totals."));
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Type the new year name"), { target: { value: "2027-2" } });
    expect(btn.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Type the new year name"), { target: { value: "2027-28" } });
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    expect(onConfirm).toHaveBeenCalledWith(true, "2027-28");
  });
  it("a red checklist keeps Confirm off even when ticked and typed, and says why", () => {
    render(<ConfirmBox preview={preview({ can_confirm: false, checklist: checks })} busy={false} onConfirm={vi.fn()} />);
    fireEvent.click(screen.getByLabelText("I have checked the totals."));
    fireEvent.change(screen.getByLabelText("Type the new year name"), { target: { value: "2027-28" } });
    expect((screen.getByRole("button", { name: /Confirm: start/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toMatch(/1 item is red/);
  });
});

describe("undo", () => {
  const run = (undo: RunInfo["undo"]): RunInfo => ({ id: "r1", from: "2026-27", to: "2027-28", from_year_id: "y1", to_year_id: "y2", status: "applied", applied_at: "2027-04-01T05:00:00Z", applied_by: "Demo Admin", undone_at: null, summary: { promoted: 90, detained: 4, passed_out: 5, left: 1, new_sections_created: 6 }, undo });
  it("when allowed: asks once more, then undoes", () => {
    const onUndo = vi.fn();
    render(<UndoCard run={run({ allowed: true, reasons: [] })} busy={false} onUndo={onUndo} />);
    expect(screen.getByText(/can still be undone/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo this rollover" }));
    expect(onUndo).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, undo" }));
    expect(onUndo).toHaveBeenCalled();
  });
  it("when blocked: says 'Undo is blocked because…' with each reason and what to do instead, and offers no undo button", () => {
    render(<UndoCard run={run({ allowed: false, reasons: [{ key: "attendance", text: "Attendance has been marked in the new year (12 sessions)", count: 12 }, { key: "receipts", text: "Fees have been collected in the new year (3 receipts)", count: 3 }], instead: "Fix individual students by hand instead." })} busy={false} onUndo={vi.fn()} />);
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Undo is blocked because:");
    expect(alert.textContent).toContain("Attendance has been marked in the new year (12 sessions)");
    expect(alert.textContent).toContain("Fees have been collected in the new year (3 receipts)");
    expect(alert.textContent).toContain("Fix individual students by hand instead.");
    expect(screen.queryByRole("button", { name: /Undo/ })).toBeNull();
  });
  it("UndoNotice alone", () => {
    render(<UndoNotice undo={{ allowed: false, reasons: [{ key: "x", text: "A reason", count: 1 }] }} />);
    expect(screen.getByText("A reason")).toBeTruthy();
  });
});

describe("who may open the page", () => {
  it("Admin only: a teacher or an office person (with any duty, fee access too) cannot", () => {
    const p = findPage("/students/promotion")!;
    expect(p.status).toBe("built");
    expect(canOpenPage(p, { role: "admin", duties: [] })).toBe(true);
    expect(canOpenPage(p, { role: "teacher", duties: ["student_records", "all_class_marks", "notices_diary", "certificates_idcards"] })).toBe(false);
    expect(canOpenPage(p, { role: "computer_staff", duties: ["fee_collection", "student_records"] })).toBe(false);
    expect(canOpenPage(p, { role: "computer_staff", duties: [] })).toBe(false);
  });
});
