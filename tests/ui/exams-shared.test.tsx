import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { describeGroup, fmtNum, fmtPct, groupMax, stepText, type CompLite, type GroupLite, type MemberLite } from "@/features/exams/shared";
import { ReportCardSheet, type CardData } from "@/components/exams/report-card";
import { canOpenPage, findPage } from "@/lib/site-map";

const comps = new Map<string, CompLite>([
  ["fa1", { id: "fa1", name: "FA1", max_marks: 20 }],
  ["fa2", { id: "fa2", name: "FA2", max_marks: 20 }],
  ["sa1", { id: "sa1", name: "SA1", max_marks: 80 }],
]);
const groups = new Map<string, GroupLite>([
  ["fa", { id: "fa", name: "Term 1 FA", kind: "part", method: "average", best_n: null, scale_to: 20 }],
  ["t1", { id: "t1", name: "Term 1", kind: "term", method: "sum", best_n: null, scale_to: null }],
]);
const members: MemberLite[] = [
  { id: "m1", group_id: "fa", component_id: "fa1", child_group_id: null, scale_to: null, sort_order: 0 },
  { id: "m2", group_id: "fa", component_id: "fa2", child_group_id: null, scale_to: null, sort_order: 1 },
  { id: "m3", group_id: "t1", component_id: null, child_group_id: "fa", scale_to: null, sort_order: 0 },
  { id: "m4", group_id: "t1", component_id: "sa1", child_group_id: null, scale_to: null, sort_order: 1 },
];

describe("exam scheme text", () => {
  it("computes the maximum of nested groups like the database", () => {
    expect(groupMax(groups.get("fa")!, members, comps, groups)).toBe(20);
    expect(groupMax(groups.get("t1")!, members, comps, groups)).toBe(100);
  });
  it("best of N takes the N largest maxima; a member scale replaces its maximum", () => {
    const g: GroupLite = { id: "b", name: "Best", kind: "part", method: "best_n", best_n: 1, scale_to: null };
    const ms: MemberLite[] = [
      { id: "x", group_id: "b", component_id: "fa1", child_group_id: null, scale_to: null, sort_order: 0 },
      { id: "y", group_id: "b", component_id: "sa1", child_group_id: null, scale_to: 40, sort_order: 1 },
    ];
    expect(groupMax(g, ms, comps, new Map())).toBe(40);
  });
  it("describes the rule in words so Admin can check it", () => {
    expect(describeGroup(groups.get("t1")!, members, comps, groups)).toBe("Term 1 = Term 1 FA (/20) + SA1 (/80) → out of 100");
    expect(describeGroup(groups.get("fa")!, members, comps, groups)).toContain("average of FA1 (/20), FA2 (/20), scaled to 20");
  });
  it("formats numbers without trailing zeros and percentages with one decimal", () => {
    expect(fmtNum(17.5)).toBe("17.5");
    expect(fmtNum("20.00")).toBe("20");
    expect(fmtNum(33.333)).toBe("33.33");
    expect(fmtNum(null)).toBe("");
    expect(fmtPct(72.456)).toBe("72.5%");
    expect(fmtPct(35)).toBe("35.0%");
  });
  it("explains each calculation step, including absent, missing and not applicable", () => {
    expect(stepText({ label: "FA1", status: "absent", raw: 0, raw_max: 20 })).toBe("FA1: absent (AB) = 0 of 20");
    expect(stepText({ label: "FA2", status: "na" })).toContain("not applicable");
    expect(stepText({ label: "FA3", status: "missing", raw: 0, raw_max: 20 })).toContain("not entered yet");
    expect(stepText({ label: "FA1", status: "marked", raw: 15, raw_max: 20, scaled_to: 10, v: 7.5, mx: 10 })).toBe("FA1: 15 of 20, scaled to 10 = 7.5 of 10");
  });
});

const card = (dup: boolean): CardData => ({
  duplicate: dup,
  mode: "marks",
  year: "2026-27",
  group: { id: "g", name: "Term 1", kind: "term", start_date: "2026-04-01", end_date: "2026-09-30" },
  student: { id: "s", name: "Test Student", admission_no: "DEMO-1", roll_no: 3, class: "Class 8", section: "A" },
  components: [{ id: "fa1", name: "FA1", max: 20 }, { id: "sa1", name: "SA1", max: 80 }],
  children: [],
  child_totals: {},
  subjects: [{ subject_id: "m", name: "Mathematics", name_te: "గణితం", marks: { fa1: { status: "absent", marks: null }, sa1: { status: "na", marks: null } }, child_results: null, scored: 0, max_marks: 0, pct: null, grade: null, grade_point: null, passed: null, missing: 0 }],
  co_scholastic: [{ subject_id: "a", name: "Art", name_te: null, grade: "B", grade_label: "Very good", remark: null }],
  total: { scored: 70, max: 100, pct: 70, grade: "B2", grade_point: 7, result: "pass", failed: 0 },
  remark: { en: "Good progress.", te: "మంచి పురోగతి." },
});
const school = { name: "KCHS", address: "Vempalli Road", phone: "+91 99", udise: null, recognition: null, logoUrl: "/l.png" };
describe("report card", () => {
  it("shows AB and N/A for absent and not applicable, the result, remarks in English and Telugu, and three signature lines", () => {
    const h = renderToStaticMarkup(<ReportCardSheet data={card(false)} school={school} attendance={{ working: 100, present: 90, absent: 10, pct: 90, unmarked: 0 }} />);
    expect(h).toContain(">AB<");
    expect(h).toContain("N/A");
    expect(h).toContain("PASS");
    expect(h).toContain("Good progress.");
    expect(h).toContain("మంచి పురోగతి.");
    for (const t of ["Class teacher", "Principal", "Parent / Guardian"]) expect(h).toContain(t);
    expect(h).not.toContain("DUPLICATE");
    expect(h).not.toMatch(/UDISE|Recognition/);
  });
  it("a reprint says DUPLICATE; missing attendance sessions are called out", () => {
    const h = renderToStaticMarkup(<ReportCardSheet data={card(true)} school={school} attendance={{ working: 100, present: 90, absent: 8, pct: 90, unmarked: 4 }} />);
    expect(h).toContain("DUPLICATE");
    expect(h).toContain("4 attendance session(s)");
  });
});

describe("exam pages (site map)", () => {
  const admin = { role: "admin" as const, duties: [] };
  const teacher = { role: "teacher" as const, duties: [] };
  const duty = { role: "teacher" as const, duties: ["all_class_marks" as const] };
  const open = (p: string, w: Parameters<typeof canOpenPage>[1]) => canOpenPage(findPage(p)!, w);
  it("marks, results, grades and report cards are open to teachers; the scheme is Admin only; locks need the duty", () => {
    for (const p of ["/exams", "/exams/marks", "/exams/results", "/exams/grades", "/exams/report-cards"]) {
      expect(open(p, teacher)).toBe(true);
      expect(open(p, admin)).toBe(true);
    }
    expect(open("/exams/scheme", admin)).toBe(true);
    expect(open("/exams/scheme", teacher)).toBe(false);
    expect(open("/exams/scheme", duty)).toBe(false);
    expect(open("/exams/locks", duty)).toBe(true);
    expect(open("/exams/locks", teacher)).toBe(false);
  });
});

import { groupsContaining } from "@/features/exams/shared";
describe("which result an exam counts towards", () => {
  const all = [
    { id: "fa", name: "Term 1 FA", kind: "part" as const, method: "average" as const, best_n: null, scale_to: 20, sort_order: 1 },
    { id: "t1", name: "Term 1", kind: "term" as const, method: "sum" as const, best_n: null, scale_to: null, sort_order: 2 },
    { id: "t2", name: "Term 2", kind: "term" as const, method: "sum" as const, best_n: null, scale_to: null, sort_order: 4 },
    { id: "fin", name: "Final", kind: "final" as const, method: "sum" as const, best_n: null, scale_to: null, sort_order: 5 },
  ];
  const ms: MemberLite[] = [
    { id: "1", group_id: "fa", component_id: "fa1", child_group_id: null, scale_to: null, sort_order: 0 },
    { id: "2", group_id: "t1", component_id: null, child_group_id: "fa", scale_to: null, sort_order: 0 },
    { id: "3", group_id: "t1", component_id: "sa1", child_group_id: null, scale_to: null, sort_order: 1 },
    { id: "4", group_id: "fin", component_id: null, child_group_id: "t1", scale_to: null, sort_order: 0 },
    { id: "5", group_id: "fin", component_id: null, child_group_id: "t2", scale_to: null, sort_order: 1 },
    { id: "6", group_id: "t2", component_id: "sa2", child_group_id: null, scale_to: null, sort_order: 0 },
  ];
  it("lists the term first, then the final, then the parts; Term 1 exams never list Term 2", () => {
    expect(groupsContaining("fa1", ms, all).map((g) => g.name)).toEqual(["Term 1", "Final", "Term 1 FA"]);
    expect(groupsContaining("sa2", ms, all).map((g) => g.name)).toEqual(["Term 2", "Final"]);
  });
  it("an exam in no result lists nothing", () => expect(groupsContaining("zzz", ms, all)).toEqual([]));
});

// ---------------------------------------------------------------- unmarked attendance warning before printing
import { render, screen, cleanup } from "@testing-library/react";
import { unmarkedWarning } from "@/features/exams/shared";
import { AttendanceWarning } from "@/components/exams/attendance-warning";

describe("unmarked attendance warning", () => {
  it("warns only when MORE than 5% of the sessions were never marked", () => {
    expect(unmarkedWarning(95, 5)).toBeNull(); // exactly 5%: no warning
    expect(unmarkedWarning(94, 6)).toEqual({ unmarked: 6, total: 100, pct: 6 });
    expect(unmarkedWarning(0, 0)).toBeNull(); // nothing scheduled
    expect(unmarkedWarning(100, 0)).toBeNull();
    expect(unmarkedWarning(0, 10)?.pct).toBe(100);
  });
  it("tells Admin the numbers and where to fix it", () => {
    render(<AttendanceWarning unmarked={308} total={410} pct={75} />);
    expect(screen.getByRole("alert").textContent).toMatch(/308 of 410 attendance sessions \(75%\)/);
    expect(screen.getByRole("link", { name: "Attendance" }).getAttribute("href")).toBe("/attendance");
    cleanup();
  });
});
