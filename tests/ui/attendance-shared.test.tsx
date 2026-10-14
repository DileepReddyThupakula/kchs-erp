import { describe, expect, it } from "vitest";
import { DAY_MARK, attended, dayOfWeek, monthLabel, monthRange, shiftMonth } from "@/features/attendance/shared";
import { canOpenPage, findPage } from "@/lib/site-map";

describe("attendance helpers", () => {
  it("counts Present and Late as attended; Absent and Leave as not attended", () => {
    expect(attended("present")).toBe(true);
    expect(attended("late")).toBe(true);
    expect(attended("absent")).toBe(false);
    expect(attended("leave")).toBe(false);
    expect(attended(null)).toBe(false);
  });
  it("gives every daily status a printable mark", () => {
    expect(DAY_MARK.present).toBe("P");
    expect(DAY_MARK.absent).toBe("A");
    expect(DAY_MARK.morning_only).toBe("½M");
    expect(DAY_MARK.afternoon_only).toBe("½A");
  });
  it("works out month ranges and navigation", () => {
    expect(monthRange("2026-02")).toMatchObject({ from: "2026-02-01", to: "2026-02-28", days: 28 });
    expect(monthRange("2028-02").days).toBe(29);
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(monthLabel("2026-10")).toBe("October 2026");
    expect(dayOfWeek("2026-10-18")).toBe(0);
  });
});

describe("attendance and leave pages (site map)", () => {
  const admin = { role: "admin" as const, duties: [] };
  const plain = { role: "teacher" as const, duties: [] };
  const duty = { role: "teacher" as const, duties: ["all_class_attendance" as const] };

  it("marking and reports: Admin and every teacher (scope is enforced by the data)", () => {
    for (const p of ["/attendance", "/attendance/reports"]) {
      const page = findPage(p)!;
      expect(page.status).toBe("built");
      expect(canOpenPage(page, admin)).toBe(true);
      expect(canOpenPage(page, plain)).toBe(true);
      expect(canOpenPage(page, duty)).toBe(true);
    }
  });
  it("staff attendance and leave approvals are Admin only", () => {
    for (const p of ["/staff/attendance", "/staff/leave"]) {
      const page = findPage(p)!;
      expect(page.status).toBe("built");
      expect(canOpenPage(page, admin)).toBe(true);
      expect(canOpenPage(page, plain)).toBe(false);
      expect(canOpenPage(page, duty)).toBe(false);
    }
  });
  it("My leave is for teachers", () => {
    const page = findPage("/my/leave")!;
    expect(page.status).toBe("built");
    expect(canOpenPage(page, plain)).toBe(true);
    expect(canOpenPage(page, admin)).toBe(false);
  });
});
