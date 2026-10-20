// Security self-audit fixes: password rule, forced password change, real-file checks, file names, error messages.
import { afterEach, describe, expect, it, vi } from "vitest";
import { passwordSchema } from "@/features/staff/password";
import { forcedChangeRedirect, mustChangePassword } from "@/lib/auth/force-change";
import { checkBytes, checkUpload, DOCUMENTS, LOGOS, PHOTOS, safeFileName, safePathPart, sniff } from "@/lib/upload-check";
import { friendlyDbError, safeDbMessage } from "@/lib/utils";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPG = [0xff, 0xd8, 0xff, 0xe0];
const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d];
const WEBP = [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const text = (s: string) => Array.from(new TextEncoder().encode(s));
const file = (b: number[], name: string, type: string) => new File([new Uint8Array(b)], name, { type });

// jsdom's Blob has no arrayBuffer(); the real server (Node) does
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function (this: Blob) {
    return new Promise<ArrayBuffer>((res) => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.readAsArrayBuffer(this); });
  };
}

afterEach(() => vi.restoreAllMocks());

describe("passwords", () => {
  it("need at least 10 characters (staff create and reset)", () => {
    expect(passwordSchema.safeParse("123456789").success).toBe(false);
    expect(passwordSchema.safeParse("1234567890").success).toBe(true);
    expect(passwordSchema.safeParse("x".repeat(73)).success).toBe(false);
    expect(passwordSchema.safeParse("x".repeat(9)).error?.issues[0].message).toBe("At least 10 characters");
  });
});

describe("first sign-in: must change the password", () => {
  const flagged = { app_metadata: { must_change_password: true } };
  it("sends a flagged login to the change screen from every other page", () => {
    expect(mustChangePassword(flagged)).toBe(true);
    for (const p of ["/dashboard", "/students", "/fees/collect", "/print/receipt"]) expect(forcedChangeRedirect(flagged, p)).toBe("/change-password");
  });
  it("lets the flagged login reach the change screen itself", () => {
    expect(forcedChangeRedirect(flagged, "/change-password")).toBeNull();
  });
  it("does not touch a normal login, a cleared mark, or nobody", () => {
    expect(forcedChangeRedirect({ app_metadata: {} }, "/dashboard")).toBeNull();
    expect(forcedChangeRedirect({ app_metadata: { must_change_password: false } }, "/dashboard")).toBeNull();
    expect(forcedChangeRedirect({}, "/dashboard")).toBeNull();
    expect(forcedChangeRedirect(null, "/dashboard")).toBeNull();
  });
});

describe("uploads are judged by their first bytes", () => {
  it("recognises the four allowed kinds", () => {
    expect(sniff(bytes(...PNG))).toBe("png");
    expect(sniff(bytes(...JPG))).toBe("jpeg");
    expect(sniff(bytes(...WEBP))).toBe("webp");
    expect(sniff(bytes(...PDF))).toBe("pdf");
  });
  it("refuses an SVG or HTML file renamed to .png, and a text file called .pdf", async () => {
    expect((await checkUpload(file(text('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), "logo.png", "image/png"), LOGOS)).ok).toBe(false);
    expect((await checkUpload(file(text("<html><script>alert(1)</script>"), "photo.jpg", "image/jpeg"), PHOTOS)).ok).toBe(false);
    expect((await checkUpload(file(text("hello"), "report.pdf", "application/pdf"), DOCUMENTS)).ok).toBe(false);
    expect((await checkUpload(file([], "empty.png", "image/png"), PHOTOS)).ok).toBe(false);
  });
  it("uses the real kind, not the claimed one, for the stored type and extension", async () => {
    const r = await checkUpload(file([...PNG, 1, 2, 3], "scan.pdf", "application/pdf"), DOCUMENTS);
    expect(r).toMatchObject({ ok: true, kind: "png", mime: "image/png", ext: "png" });
  });
  it("each place allows only its own kinds", async () => {
    expect((await checkUpload(file([...PDF, 1], "a.pdf", "application/pdf"), PHOTOS)).ok).toBe(false);          // photos: no PDF
    expect((await checkUpload(file([...WEBP], "a.webp", "image/webp"), LOGOS)).ok).toBe(false);                   // logo / signature: PNG or JPG only
    expect((await checkUpload(file([...WEBP], "a.webp", "image/webp"), DOCUMENTS)).ok).toBe(true);
    expect(checkBytes(bytes(...JPG), PHOTOS).ok).toBe(true);
    expect(checkBytes(bytes(...PDF), PHOTOS).ok).toBe(false);
  });
});

describe("file names", () => {
  it("drops folders and odd characters and keeps a short extension", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd");
    expect(safeFileName("C:\\Users\\x\\Aadhaar copy.PDF")).toBe("Aadhaar copy.pdf");
    expect(safeFileName("<script>alert(1)</script>.png")).toBe("script.png");
    expect(safeFileName("...")).toBe("file");
    expect(safeFileName("a".repeat(200) + ".jpeg").length).toBeLessThanOrEqual(66);
  });
  it("only simple codes go into a storage path", () => {
    expect(safePathPart("birth_certificate")).toBe(true);
    expect(safePathPart("../x")).toBe(false);
    expect(safePathPart("a/b")).toBe(false);
    expect(safePathPart("")).toBe(false);
  });
});

describe("error messages", () => {
  it("keeps the messages our own database functions write for staff", () => {
    expect(safeDbMessage("Type the new year name exactly to confirm.", "P0001")).toBe("Type the new year name exactly to confirm.");
    expect(safeDbMessage("This receipt is already cancelled.", "23514")).toBe("This receipt is already cancelled.");
    expect(friendlyDbError({ code: "42501", message: "anything" })).toBe("You don't have permission to do this.");
  });
  it("keeps the existing friendly messages for duplicate and in-use errors", () => {
    expect(friendlyDbError({ code: "23505", message: 'duplicate key value violates unique constraint "fee_heads_name_key"' })).toBe("This already exists (duplicate name or code).");
    expect(friendlyDbError({ code: "23503", message: 'update or delete on table "classes" violates foreign key constraint "x"' })).toBe("This is still in use elsewhere, so it can't be removed.");
  });
  it("replaces Postgres and Supabase wording by a short text and logs the real one on the server", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const out = [
      safeDbMessage('new row for relation "students" violates check constraint "students_pincode_check"', "23514"),
      safeDbMessage('column "aadhaar" of relation "students" does not exist', "42703"),
      safeDbMessage("JWT expired", "PGRST301"),
      safeDbMessage("canceling statement due to statement timeout", "57014"),
      safeDbMessage("Some unexpected failure", "XX000"),
    ];
    for (const m of out) expect(m).not.toMatch(/students|aadhaar|JWT|constraint|relation|column|timeout/i);
    expect(out[0]).toBe("That value is not allowed. Please check what you entered.");
    expect(out[4]).toMatch(/^Something went wrong/);
    expect(log).toHaveBeenCalledTimes(5);
    expect(log.mock.calls[0].join(" ")).toContain("students_pincode_check");   // the detail is in the log
  });
});
