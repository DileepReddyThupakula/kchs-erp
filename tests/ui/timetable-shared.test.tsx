import { describe, expect, it } from "vitest";
import { addDays, fmtRange, fmtTime, mondayOf, slotsFor, teachingSlots, weekdayOf, type BellData } from "@/features/timetable/shared";
import { canOpenPage, findPage } from "@/lib/site-map";

const slot = (id: string, kind: "teaching" | "break" | "lunch", no: number | null, s: string, e: string) => ({ id, seq: 0, kind, periodNo: no, label: "", start: s, end: e });
const bell: BellData = {
  schedules: [
    { id: "reg", name: "Regular", note: null, isDefault: true },
    { id: "half", name: "Half", note: null, isDefault: false },
  ],
  periods: {
    reg: [slot("a", "teaching", 1, "09:00:00", "09:40:00"), slot("b", "lunch", null, "11:55:00", "12:40:00"), slot("c", "teaching", 5, "12:40:00", "13:20:00")],
    half: [slot("d", "teaching", 1, "09:00:00", "09:40:00")],
  },
  classSchedule: { "c1|6": "half" },
  defaultId: "reg",
};

describe("timetable helpers", () => {
  it("formats times the school way (12-hour, no am/pm)", () => {
    expect(fmtTime("13:20:00")).toBe("1:20");
    expect(fmtTime("09:05:00")).toBe("9:05");
    expect(fmtTime("00:30:00")).toBe("12:30");
    expect(fmtRange("12:40:00", "13:20:00")).toBe("12:40–1:20");
  });
  it("finds weekdays and Mondays", () => {
    expect(weekdayOf("2026-10-14")).toBe(3); // Wednesday
    expect(weekdayOf("2026-10-18")).toBe(7); // Sunday
    expect(mondayOf("2026-10-18")).toBe("2026-10-12");
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
  });
  it("picks the class's schedule for a weekday, else the default", () => {
    expect(slotsFor(bell, "c1", 6).map((s) => s.id)).toEqual(["d"]);
    expect(slotsFor(bell, "c1", 1).map((s) => s.id)).toEqual(["a", "b", "c"]);
    expect(slotsFor(bell, null, 6).length).toBe(3);
    expect(teachingSlots(slotsFor(bell, "c1", 1)).map((s) => s.periodNo)).toEqual([1, 5]);
  });
});

describe("timetable page access (site map)", () => {
  const admin = { role: "admin" as const, duties: [] };
  const plain = { role: "teacher" as const, duties: [] };
  const editor = { role: "teacher" as const, duties: ["timetable_edit" as const] };
  const other = { role: "teacher" as const, duties: ["fee_collection" as const, "student_records" as const] };
  const editorPages = ["/timetable", "/timetable/teachers", "/timetable/substitutions", "/timetable/bell-schedule"];

  it("only Admin and the timetable duty open the editing pages", () => {
    for (const path of editorPages) {
      const page = findPage(path)!;
      expect(page, path).toBeTruthy();
      expect(canOpenPage(page, admin), `admin ${path}`).toBe(true);
      expect(canOpenPage(page, editor), `editor ${path}`).toBe(true);
      expect(canOpenPage(page, plain), `plain ${path}`).toBe(false);
      expect(canOpenPage(page, other), `other duties ${path}`).toBe(false);
    }
  });
  it("My timetable is for teachers (every teacher), not the Admin menu", () => {
    const page = findPage("/my/timetable")!;
    expect(page.status).toBe("built");
    expect(canOpenPage(page, plain)).toBe(true);
    expect(canOpenPage(page, editor)).toBe(true);
    expect(canOpenPage(page, admin)).toBe(false);
  });
  it("all timetable pages are marked built", () => {
    for (const path of [...editorPages, "/my/timetable"]) expect(findPage(path)!.status).toBe("built");
  });
});
