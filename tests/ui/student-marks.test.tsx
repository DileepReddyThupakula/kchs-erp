// The student profile's Marks tab: what is built from the rows, what is shown, and that nothing about fees can appear.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

import { buildMarksSummary, lineResult } from "@/features/students/marks-summary";
import { MarksPanel } from "@/app/(app)/students/[id]/marks-panel";
import { PAGES } from "@/lib/site-map";

afterEach(cleanup);
const groups = [
  { id: "t1", name: "Term 1", kind: "term", locked_at: "2026-10-01" },
  { id: "t2", name: "Term 2", kind: "term", locked_at: null },
  { id: "p1", name: "Term 1 FA", kind: "part", locked_at: null },
];
const names = new Map([["m", "Mathematics"], ["s", "Science"]]);
const row = (g: string, sub: string, over = {}) => ({ group_id: g, subject_id: sub, scored: 70, max_marks: 100, pct: 70, grade: "B1", passed: true, missing: 0, ...over });

describe("buildMarksSummary", () => {
  it("a subject teacher gets only their own rows, no total, and parts are left out", () => {
    const g = buildMarksSummary({ groups, subjectNames: names, rows: [row("t1", "m"), row("p1", "m")], totals: [], cards: new Map() });
    expect(g.map((x) => x.name)).toEqual(["Term 1"]);
    expect(g[0].source).toBe("own");
    expect(g[0].lines.map((l) => l.subject)).toEqual(["Mathematics"]);
    expect(g[0].total).toBeNull();
  });
  it("a result with nothing this person may see is not listed at all", () => {
    expect(buildMarksSummary({ groups, subjectNames: names, rows: [], totals: [], cards: new Map() })).toEqual([]);
  });
  it("where the database let them open the report card, the card's subjects and total are used", () => {
    const card = { mode: "marks" as const, subjects: [{ name: "Mathematics", scored: 70, max_marks: 100, pct: 70, grade: "B1", passed: true, missing: 0 }, { name: "Science", scored: 30, max_marks: 100, pct: 30, grade: "E", passed: false, missing: 0 }], co_scholastic: [], total: { scored: 100, max: 200, pct: 50, grade: "C2", result: "fail" as const } };
    const g = buildMarksSummary({ groups, subjectNames: names, rows: [row("t1", "m")], totals: [], cards: new Map([["t1", card]]) });
    expect(g[0].source).toBe("card");
    expect(g[0].lines).toHaveLength(2);
    expect(g[0].total?.result).toBe("fail");
  });
  it("grade classes show their grades from the card", () => {
    const card = { mode: "grades" as const, subjects: [], co_scholastic: [{ name: "Rhymes", grade: "A", grade_label: "Excellent" }], total: null };
    const g = buildMarksSummary({ groups, subjectNames: names, rows: [], totals: [], cards: new Map([["t1", card]]) });
    expect(g[0].grades).toEqual([{ subject: "Rhymes", grade: "A", label: "Excellent" }]);
  });
  it("a mark not yet entered shows Incomplete, never Pass or Fail", () => {
    expect(lineResult({ subject: "x", scored: 10, max: 20, pct: 50, grade: "C1", passed: true, missing: 1 })).toBe("incomplete");
    expect(lineResult({ subject: "x", scored: 10, max: 20, pct: 50, grade: "C1", passed: false, missing: 0 })).toBe("fail");
  });
});

describe("MarksPanel", () => {
  const own = buildMarksSummary({ groups, subjectNames: names, rows: [row("t1", "m"), row("t2", "m", { missing: 2 })], totals: [], cards: new Map() });
  it("shows the subjects, says it is the teacher's own subjects, and has no report-card link", () => {
    const { container } = render(<MarksPanel studentId="s1" yearName="2026-27" className="Class 8" groups={own} ownOnly />);
    expect(screen.getByText("You see the subjects you teach.", { exact: false })).toBeTruthy();
    expect(screen.getAllByText("Mathematics").length).toBe(2);
    expect(screen.getByText("Incomplete")).toBeTruthy();
    expect(container.querySelector('a[href*="print/report-card"]')).toBeNull();
  });
  it("offers the report card only for a locked result the person may open", () => {
    const card = { mode: "marks" as const, subjects: [{ name: "Mathematics", scored: 70, max_marks: 100, pct: 70, grade: "B1", passed: true, missing: 0 }], co_scholastic: [], total: { scored: 70, max: 100, pct: 70, grade: "B1", result: "pass" as const } };
    const g = buildMarksSummary({ groups, subjectNames: names, rows: [], totals: [], cards: new Map([["t1", card]]) });
    const { container } = render(<MarksPanel studentId="s1" yearName="2026-27" className="Class 8" groups={g} ownOnly={false} />);
    expect(container.querySelector('a[href="/print/report-card?student=s1&group=t1"]')).toBeTruthy();
    expect(screen.getAllByText("Pass").length).toBe(2); // the subject and the total
  });
  it("says so when there is nothing to show", () => {
    render(<MarksPanel studentId="s1" yearName="2026-27" className="Class 8" groups={[]} ownOnly />);
    expect(screen.getByText("No marks to show")).toBeTruthy();
  });
  it("never mentions fees, dues or money", () => {
    const { container } = render(<MarksPanel studentId="s1" yearName="2026-27" className="Class 8" groups={own} ownOnly />);
    expect(container.textContent).not.toMatch(/₹|fee|dues|receipt|paise/i);
  });
});

describe("menu links", () => {
  // /students/[id] would otherwise swallow /students/promotion and friends and show "page not found"
  const appDir = join(process.cwd(), "src/app/(app)");
  const hasStaticPage = (path: string) => existsSync(join(appDir, ...path.split("/").filter(Boolean), "page.tsx"));
  it("every planned page that sits next to a dynamic route has its own page file", () => {
    const planned = PAGES.filter((p) => p.status === "planned").map((p) => p.path);
    const missing = planned.filter((p) => {
      const parts = p.split("/").filter(Boolean);
      const parent = join(appDir, ...parts.slice(0, -1));
      const hasDynamicSibling = existsSync(parent) && readdirSync(parent).some((d) => d.startsWith("[") && !d.startsWith("[...") && statSync(join(parent, d)).isDirectory());
      return hasDynamicSibling && !hasStaticPage(p);
    });
    expect(missing).toEqual([]);
  });
  it("Promotion, Certificates and ID cards are covered", () => {
    for (const p of ["/students/promotion", "/students/certificates", "/students/id-cards"]) expect(hasStaticPage(p)).toBe(true);
  });
});
