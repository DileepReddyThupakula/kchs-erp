import { describe, expect, it } from "vitest";
import { combinedDiaryText, diaryIsLate, multiClassDiaryText } from "@/features/notices/shared";
import { chunkLines } from "@/components/notices/diary-card";
import { waAppUrl, waNumber, waUrl } from "@/lib/share";

const L = (subject: string | null, body: string, bodyTe: string | null = null) => ({ subject, body, bodyTe });

describe("combined diary text", () => {
  it("puts English first, then Telugu, class remark last, and never names a teacher", () => {
    const t = combinedDiaryText({ school: "KCHS", classLabel: "Class 8 – A", date: "2026-10-19", lines: [L("Maths", "Ex 5.1", "గణితం"), L(null, "PTM Saturday", "సమావేశం"), L("English", "Read lesson 5")] });
    expect(t.indexOf("Maths")).toBeLessThan(t.indexOf("English"));
    expect(t.indexOf("Class remark")).toBeGreaterThan(t.indexOf("English"));
    expect(t.indexOf("తెలుగు")).toBeGreaterThan(t.indexOf("Class remark"));
    expect(t).toContain("గణితం");
  });
  it("has no Telugu block when no Telugu was written", () => {
    expect(combinedDiaryText({ school: "KCHS", classLabel: "C", date: "2026-10-19", lines: [L("Maths", "x1")] })).not.toContain("తెలుగు");
  });
  it("builds one message for several classes", () => {
    const t = multiClassDiaryText({ school: "KCHS", date: "2026-10-19", classes: [{ classLabel: "Class 1", lines: [L("Maths", "aa")] }, { classLabel: "Class 2", lines: [L("EVS", "bb")] }] });
    expect(t).toContain("Class 1");
    expect(t).toContain("Class 2");
  });
});

describe("late flag", () => {
  const base = { today: "2026-10-19", deadline: "15:30", expected: 5 };
  it("is late after the deadline when subjects are missing", () => expect(diaryIsLate({ ...base, date: "2026-10-19", nowHm: "15:31", complete: false })).toBe(true));
  it("is not late before the deadline", () => expect(diaryIsLate({ ...base, date: "2026-10-19", nowHm: "15:30", complete: false })).toBe(false));
  it("is not late for a future date", () => expect(diaryIsLate({ ...base, date: "2026-10-20", nowHm: "23:00", complete: false })).toBe(false));
  it("a past incomplete class is late", () => expect(diaryIsLate({ ...base, date: "2026-10-18", nowHm: "09:00", complete: false })).toBe(true));
  it("a complete class or one with nothing expected is never late", () => {
    expect(diaryIsLate({ ...base, date: "2026-10-19", nowHm: "18:00", complete: true })).toBe(false);
    expect(diaryIsLate({ ...base, expected: 0, date: "2026-10-19", nowHm: "18:00", complete: false })).toBe(false);
  });
});

describe("image splitting", () => {
  const many = (n: number) => Array.from({ length: n }, (_, i) => L(`S${i}`, "x1"));
  it("keeps up to 8 subjects on one image", () => expect(chunkLines(many(8))).toHaveLength(1));
  it("splits 9 or more into two, remark on the last", () => {
    const parts = chunkLines([...many(10), L(null, "remark")]);
    expect(parts).toHaveLength(2);
    expect(parts[1].at(-1)?.subject).toBeNull();
  });
});

describe("WhatsApp links", () => {
  it("formats Indian numbers with +91 and digits only", () => {
    expect(waNumber("98765 43210")).toBe("919876543210");
    expect(waNumber("+91-98765-43210")).toBe("919876543210");
    expect(waNumber("09876543210")).toBe("919876543210");
    expect(waNumber("123")).toBeNull();
  });
  it("builds app, web and picker links with encoded text", () => {
    expect(waUrl("app", "a b\nc")).toBe("https://wa.me/?text=a%20b%0Ac");
    expect(waUrl("app", "x", "919876543210")).toBe("https://wa.me/919876543210?text=x");
    expect(waUrl("web", "x")).toBe("https://web.whatsapp.com/send?text=x");
    expect(waAppUrl("x")).toBe("whatsapp://send?text=x");
  });
});

import { cleanLines, stripSubjectPrefix } from "@/features/notices/shared";
describe("duplicate subject prefix", () => {
  it("strips a leading subject name and colon, keeps the rest", () => {
    expect(stripSubjectPrefix("Mathematics: exercise 5.1", ["Mathematics"])).toBe("exercise 5.1");
    expect(stripSubjectPrefix("mathematics - exercise 5.1", ["Mathematics"])).toBe("exercise 5.1");
    expect(stripSubjectPrefix("Maths: exercise 5.1", ["Mathematics"])).toBe("Maths: exercise 5.1");
    expect(stripSubjectPrefix("Mathematics:", ["Mathematics"])).toBe("Mathematics:");
  });
  it("is applied in the message and leaves stored lines alone; Telugu block uses the Telugu subject name", () => {
    const lines = [{ subject: "Mathematics", subjectTe: "గణితం", body: "Mathematics: ex 5.1", bodyTe: "గణితం: అభ్యాసం 5.1" }];
    const t = combinedDiaryText({ school: "S", classLabel: "C", date: "2026-10-19", lines });
    expect(t).toContain("1. *Mathematics:* ex 5.1");
    expect(t).toContain("1. *గణితం:* అభ్యాసం 5.1");
    expect(lines[0].body).toBe("Mathematics: ex 5.1");
    expect(cleanLines(lines)[0].body).toBe("ex 5.1");
  });
});
