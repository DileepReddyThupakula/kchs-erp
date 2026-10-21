// The public demo site: refuses anything but the development project, shows the demo logins, turns off uploads and account changes.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { demoProblem } from "@/lib/demo-guard.mjs";

const DEV = "https://cndkkullvdxwesskbznx.supabase.co";
const PROD = "https://zxgvxtwtdevlezciymjf.supabase.co";
afterEach(() => { cleanup(); vi.resetModules(); vi.doUnmock("@/lib/demo"); });

describe("the demo refuses to start anywhere but on the development project", () => {
  it("is silent when demo mode is off (even on production: production never runs in demo mode)", () => {
    expect(demoProblem({ NEXT_PUBLIC_SUPABASE_URL: PROD })).toBeNull();
    expect(demoProblem({})).toBeNull();
  });
  it("accepts demo mode on the development project", () => {
    expect(demoProblem({ NEXT_PUBLIC_DEMO_MODE: "true", NEXT_PUBLIC_SUPABASE_URL: DEV })).toBeNull();
  });
  it("fails closed: production, any other project, or an unclear address", () => {
    expect(demoProblem({ NEXT_PUBLIC_DEMO_MODE: "true", NEXT_PUBLIC_SUPABASE_URL: PROD })).toMatch(/not the development project/);
    expect(demoProblem({ NEXT_PUBLIC_DEMO_MODE: "true", NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co" })).toMatch(/not the development project/);
    expect(demoProblem({ NEXT_PUBLIC_DEMO_MODE: "true" })).toMatch(/cannot tell/);
    expect(demoProblem({ NEXT_PUBLIC_DEMO_MODE: "true", NEXT_PUBLIC_SUPABASE_URL: "https://example.com" })).toMatch(/cannot tell/);
  });
  it("refuses if the production project appears in ANY variable, even next to the dev address", () => {
    expect(demoProblem({ NEXT_PUBLIC_DEMO_MODE: "true", NEXT_PUBLIC_SUPABASE_URL: DEV, DATABASE_URL: "postgresql://postgres.zxgvxtwtdevlezciymjf:x@h/db" })).toMatch(/PRODUCTION/);
    expect(demoProblem({ NEXT_PUBLIC_DEMO_MODE: "true", NEXT_PUBLIC_SUPABASE_URL: DEV, SOMETHING: PROD })).toMatch(/PRODUCTION/);
  });
});

const withDemo = async (on: boolean) => {
  vi.resetModules();
  vi.doMock("@/lib/demo", async () => {
    const real = await vi.importActual<typeof import("@/lib/demo")>("@/lib/demo");
    return { ...real, DEMO_MODE: on, demoBlock: () => (on ? { error: real.DEMO_MESSAGE } : null) };
  });
};

describe("on the demo site", () => {
  it("shows the label and the four demo logins, and one click fills the form", async () => {
    await withDemo(true);
    vi.stubEnv("NEXT_PUBLIC_DEMO_PASSWORD", "Demo@Sample2026");
    const { DemoBanner } = await import("@/components/demo/demo-banner");
    const { DemoAccounts } = await import("@/components/demo/demo-accounts");
    render(<><input id="login" /><input id="password" /><DemoBanner /><DemoAccounts /></>);
    expect(screen.getByRole("note").textContent).toMatch(/dummy data only/i);
    for (const r of ["Admin", "Teacher", "Fee office", "Front office"]) expect(screen.getByText(r)).toBeTruthy();
    expect(screen.getByText("Demo@Sample2026")).toBeTruthy();
    fireEvent.click(screen.getByText("Teacher").closest("button")!);
    expect((document.getElementById("login") as HTMLInputElement).value).toBe("teacher1@demo.kchs.test");
    expect((document.getElementById("password") as HTMLInputElement).value).toBe("Demo@Sample2026");
    vi.unstubAllEnvs();
  });
  it("blocks the actions with a friendly message", async () => {
    await withDemo(true);
    const { demoBlock } = await import("@/lib/demo");
    expect(demoBlock()).toEqual({ error: expect.stringMatching(/demo with dummy data/i) });
  });
});

describe("everywhere else (production, local development)", () => {
  it("shows nothing and blocks nothing", async () => {
    await withDemo(false);
    const { DemoBanner } = await import("@/components/demo/demo-banner");
    const { DemoAccounts } = await import("@/components/demo/demo-accounts");
    const { container } = render(<><DemoBanner /><DemoAccounts /></>);
    expect(container.textContent).toBe("");
    const { demoBlock } = await import("@/lib/demo");
    expect(demoBlock()).toBeNull();
  });
  it("is off unless NEXT_PUBLIC_DEMO_MODE is exactly 'true'", async () => {
    vi.resetModules();
    for (const v of [undefined, "", "false", "1", "TRUE"]) {
      vi.stubEnv("NEXT_PUBLIC_DEMO_MODE", v as string);
      expect((await import("@/lib/demo")).DEMO_MODE).toBe(false);
      vi.resetModules();
    }
    vi.unstubAllEnvs();
  });
});
