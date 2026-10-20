// Login IDs: mobile number / username / email -> a hidden address; masking; keyed hash; the login form.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { HIDDEN_DOMAIN, isHiddenAddress, loginKey, loginLabel, maskLoginId, parseLoginId } from "@/lib/auth/login-id.mjs";

vi.mock("@/features/auth/actions", () => ({ signIn: vi.fn() }));

const ok = (raw: string) => { const p = parseLoginId(raw); if (!p.ok) throw new Error(p.error); return p; };

describe("login IDs", () => {
  it("a mobile number becomes a hidden address; spaces, +91 and a leading 0 are ignored", () => {
    for (const raw of ["9876543210", "98765 43210", "+91 98765-43210", "919876543210", "09876543210", " (98765) 43210 "]) {
      expect(ok(raw)).toMatchObject({ kind: "mobile", canonical: "9876543210", authEmail: `m9876543210@${HIDDEN_DOMAIN}` });
    }
  });
  it("refuses numbers that are not Indian mobile numbers", () => {
    for (const raw of ["12345", "5876543210", "98765432100", "+44 7911 123456"]) expect(parseLoginId(raw).ok).toBe(false);
  });
  it("usernames: lower case, start with a letter, 3 to 30 characters", () => {
    expect(ok("Ravi.Teacher")).toMatchObject({ kind: "username", canonical: "ravi.teacher", authEmail: `u-ravi.teacher@${HIDDEN_DOMAIN}` });
    for (const raw of ["ab", "1abc", "has space", "a".repeat(31), "bad/char", "-start"]) expect(parseLoginId(raw).ok, raw).toBe(false);
  });
  it("emails stay as they are (lower case) and work exactly as before", () => {
    expect(ok(" Teacher1@Demo.KCHS.test ")).toMatchObject({ kind: "email", canonical: "teacher1@demo.kchs.test", authEmail: "teacher1@demo.kchs.test" });
    for (const raw of ["a@b", "no at.com@", "@x.com", "two@@x.com"]) expect(parseLoginId(raw).ok, raw).toBe(false);
  });
  it("nobody can type the hidden address itself", () => {
    expect(parseLoginId(`m9876543210@${HIDDEN_DOMAIN}`).ok).toBe(false);
    expect(isHiddenAddress(`u-x@${HIDDEN_DOMAIN}`)).toBe(true);
    expect(isHiddenAddress("a@b.com")).toBe(false);
  });
  it("a mobile number is shown masked; usernames and emails as typed", () => {
    expect(loginLabel(ok("9876543210"))).toBe("******3210");
    expect(loginLabel(ok("ravi.t"))).toBe("ravi.t");
    expect(maskLoginId("9876543210")).toBe("******3210");
    expect(maskLoginId("a@b.com")).toBe("a@b.com");
  });
  it("the key is a keyed hash: it depends on the secret, the kind and the ID, and is not a plain hash", () => {
    const secret = "x".repeat(40);
    const a = loginKey(ok("9876543210"), secret);
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(loginKey(ok("98765 43210"), secret)).toBe(a);                      // same number, same key
    expect(loginKey(ok("9876543211"), secret)).not.toBe(a);
    expect(loginKey(ok("9876543210"), "y".repeat(40))).not.toBe(a);          // another secret, another key
    expect(a).not.toBe(require("node:crypto").createHash("sha256").update("mobile:9876543210").digest("hex").slice(0, 32));
    expect(() => loginKey(ok("9876543210"), "")).toThrow(/LOGIN_KEY_SECRET/);
    expect(() => loginKey(ok("9876543210"), "short")).toThrow();
  });
});

describe("the sign-in form", () => {
  it("asks for a mobile number, username or email, and has no forgot-password link", async () => {
    const { LoginForm } = await import("@/app/(auth)/login/login-form");
    const { container } = render(<LoginForm />);
    expect(screen.getByLabelText(/mobile number, username or email/i)).toBeTruthy();
    expect((screen.getByLabelText(/mobile number, username or email/i) as HTMLInputElement).type).toBe("text");
    expect(container.textContent).not.toMatch(/forgot|reset your password|email me/i);
    expect(container.querySelector("a")).toBeNull();
  });
});
