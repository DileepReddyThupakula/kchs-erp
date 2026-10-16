import { describe, expect, it } from "vitest";
import { addDaysIso, diaryWhatsApp, fmtLong, noticeState, noticeWhatsApp } from "@/features/notices/shared";
import { canOpenPage, findPage } from "@/lib/site-map";

describe("notices helpers", () => {
  it("works out the state of a notice", () => {
    const base = { archived_at: null, status: "published", publish_date: "2026-10-10", expires_on: null as string | null };
    expect(noticeState(base, "2026-10-14")).toBe("active");
    expect(noticeState({ ...base, expires_on: "2026-10-13" }, "2026-10-14")).toBe("expired");
    expect(noticeState({ ...base, expires_on: "2026-10-14" }, "2026-10-14")).toBe("active");
    expect(noticeState({ ...base, publish_date: "2026-10-20" }, "2026-10-14")).toBe("scheduled");
    expect(noticeState({ ...base, status: "draft" }, "2026-10-14")).toBe("draft");
    expect(noticeState({ ...base, archived_at: "2026-10-01" }, "2026-10-14")).toBe("archived");
  });
  it("formats dates and shifts days", () => {
    expect(fmtLong("2026-10-14")).toBe("Wednesday, 14 October 2026");
    expect(addDaysIso("2026-10-31", 1)).toBe("2026-11-01");
  });
  it("builds the diary text for WhatsApp", () => {
    const t = diaryWhatsApp({ school: "KCHS", classLabel: "Class 6 – A", date: "2026-10-14", lines: [{ subject: "Maths", body: "Exercise 4.2" }, { subject: "Telugu", body: "Telugu: read lesson 5" }, { subject: null, body: "Sign the diary" }] });
    expect(t).toContain("*Daily diary · Class 6 – A*");
    expect(t).toContain("1. *Maths:* Exercise 4.2");
    expect(t).toContain("2. Telugu: read lesson 5"); // subject not repeated
    expect(t).toContain("3. Sign the diary");
    expect(diaryWhatsApp({ school: "S", classLabel: "C", date: "2026-10-14", lines: [] })).toContain("No diary entries");
  });
  it("builds the circular text for WhatsApp", () => {
    const t = noticeWhatsApp({ school: "KCHS", circularNo: "KCHS/2026-27/003", date: "2026-10-14", title: "Staff meeting", body: "At 4 pm.", audienceLine: "Teachers" });
    expect(t).toContain("Circular No: KCHS/2026-27/003");
    expect(t).toContain("*Staff meeting*");
    expect(t.trim().endsWith("- Principal")).toBe(true);
  });
});

describe("diary and notices pages (site map)", () => {
  const admin = { role: "admin" as const, duties: [] };
  const plain = { role: "teacher" as const, duties: [] };
  const duty = { role: "teacher" as const, duties: ["notices_diary" as const] };
  it("both are built and open to every teacher (view only unless they hold the duty)", () => {
    for (const p of ["/diary", "/notices"]) {
      const page = findPage(p)!;
      expect(page.status).toBe("built");
      expect(canOpenPage(page, admin)).toBe(true);
      expect(canOpenPage(page, plain)).toBe(true);
      expect(canOpenPage(page, duty)).toBe(true);
    }
  });
});
