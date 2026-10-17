import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CircularSheet, schoolIdLine, type CircularData } from "@/components/notices/circular-sheet";
import { isParentsAudience, noticeWhatsApp, AUDIENCE_LABEL } from "@/features/notices/shared";
import { circularData } from "@/features/notices/circular";

const school = { name: "Krishna Chaitanya High School", address: "Vempalli Road, Yerraguntla", phone: "+91 9985698213", udise: null, recognition: null, logoUrl: "/logo.png" };
const data: CircularData = { school, circularNo: "KCHS/2026-27/007", dateLong: "17 October 2026", toLine: "Parents and students of Class 6", title: "Annual Day", body: "Rehearsals from Monday 19 October.", titleTe: "వార్షికోత్సవం", bodyTe: "సోమవారం నుండి రిహార్సల్స్." };
const html = (d: CircularData, layout: "a4" | "image" = "a4", part?: "all" | "first" | "second") => renderToStaticMarkup(<CircularSheet data={d} layout={layout} part={part} />);

describe("circular design", () => {
  it("prints nothing for a UDISE or recognition number that is not set (no placeholders)", () => {
    expect(schoolIdLine(school)).toBe("Phone: +91 9985698213");
    for (const layout of ["a4", "image"] as const) {
      const h = html(data, layout);
      expect(h).not.toMatch(/UDISE|Recognition/i);
      expect(h).not.toContain("XXXX");
    }
  });
  it("prints them when they are set", () => {
    const h = html({ ...data, school: { ...school, udise: "28010100101", recognition: "RC 123/2010" } });
    expect(h).toContain("UDISE: 28010100101");
    expect(h).toContain("Recognition No: RC 123/2010");
  });
  it("has a blank signature line and stamp circle and never a signature image", () => {
    const h = html(data);
    expect(h).toContain("Principal");
    expect((h.match(/<img/g) ?? []).length).toBe(1); // only the school logo
    expect(h).not.toMatch(/signature\.|principal_signature/i);
    expect(h).toContain("space for the school stamp");
  });
  it("shows English and Telugu in two separate labelled blocks, English first, and a Subject line", () => {
    const h = html(data);
    expect(h.indexOf("ENGLISH")).toBeGreaterThan(-1);
    expect(h.indexOf("ENGLISH")).toBeLessThan(h.indexOf("తెలుగు"));
    expect(h).toContain("Subject: Annual Day");
    expect(h).toContain("Circular No:");
    expect(h).toContain("To:");
  });
  it("an English-only notice has no Telugu block", () => {
    const h = html({ ...data, titleTe: null, bodyTe: null });
    expect(h).not.toContain("తెలుగు");
  });
  it("a long circular splits: English on the first image, Telugu and signature on the second", () => {
    const a = html(data, "image", "first");
    const b = html(data, "image", "second");
    expect(a).toContain("ENGLISH");
    expect(a).not.toContain("Principal");
    expect(b).toContain("Principal");
    expect(b).not.toContain("ENGLISH");
    expect(b).toContain("వార్షికోత్సవం");
  });
  it("shows the draft marker only for drafts", () => {
    expect(html({ ...data, draft: true })).toContain("draft");
    expect(html(data)).not.toContain("(draft");
  });
});

describe("parents audience and WhatsApp text", () => {
  it("parents audiences are recognised and labelled", () => {
    expect(isParentsAudience("parents_all")).toBe(true);
    expect(isParentsAudience("parents_classes")).toBe(true);
    expect(isParentsAudience("all")).toBe(false);
    expect(AUDIENCE_LABEL.parents_all).toMatch(/Parents and students/);
  });
  it("the circular data carries only the heading, never student names", () => {
    const d = circularData({ circular_no: "X/1", publish_date: "2026-10-17", title: "T title", body: "Body text", title_te: null, body_te: null, status: "published" }, school, "Parents and students");
    expect(d.toLine).toBe("Parents and students");
    expect(Object.keys(d)).not.toContain("students");
  });
  it("the message is English first, then Telugu, with no file names or paths", () => {
    const t = noticeWhatsApp({ school: "KCHS", circularNo: "KCHS/2026-27/007", date: "2026-10-17", title: "Annual Day", body: "Rehearsals", titleTe: "వార్షికోత్సవం", bodyTe: "రిహార్సల్స్", audienceLine: "Parents and students" });
    expect(t.indexOf("Rehearsals")).toBeLessThan(t.indexOf("రిహార్సల్స్"));
    expect(t).toContain("To: Parents and students");
    expect(t).not.toMatch(/\.(png|jpg|webp|pdf)|\/Users\/|file:/i);
  });
  it("an English-only notice has no Telugu section", () => {
    expect(noticeWhatsApp({ school: "K", circularNo: null, date: "2026-10-17", title: "T title", body: "Body", audienceLine: "All staff" })).not.toContain("తెలుగు");
  });
});
