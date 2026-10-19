// Audit log screens: alert cards, entry list, filters from the address bar, History link, and the site-map rules.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/features/timetable/queries", () => ({ getSectionsInfo: vi.fn() }));
vi.mock("@/features/notices/queries", () => ({ signedLinks: vi.fn() }));

import { AuditAlertCards } from "@/components/dashboard/audit-alerts";
import { AuditEntryList } from "@/components/audit/entry-list";
import { HistoryLink } from "@/components/audit/history-link";
import { AdminDashboardCards, type AdminDashboardData } from "@/components/dashboard/admin-cards";
import { ALERT_COPY, alertHref, auditRpcArgs, changesText, parseAuditFilters, type AlertKey, type AuditAlerts, type AuditRow } from "@/features/audit/shared";
import { canOpenPage, findPage } from "@/lib/site-map";

afterEach(cleanup);

const KEYS: AlertKey[] = ["ids_revealed", "receipts_cancelled", "exams_unlocked", "marks_after_unlock", "failed_logins", "duties_changed", "roles_changed", "staff_deactivated"];
const alerts = (over: Partial<Record<AlertKey, number>> = {}): AuditAlerts => ({
  days: 7,
  items: KEYS.map((key) => ({ key, label: key, severity: "high", count: over[key] ?? 0, latest_at: null, rows: over[key] ? [{ at: "2026-10-19T05:00:00Z", who: "Au Admin", text: key === "failed_logins" ? "Failed sign-in for victim@school.test" : "Something happened" }] : [] })),
});

describe("alert cards", () => {
  it("shows all 8 cards and a calm line when nothing happened", () => {
    render(<AuditAlertCards alerts={alerts()} today="2026-10-19" />);
    expect(screen.getAllByRole("listitem").filter((li) => li.querySelector("h3")).length).toBe(8);
    expect(screen.getByText(/Nothing unusual was recorded/)).toBeTruthy();
  });

  it("failed sign-ins are worded as 'look into it', never as an attack", () => {
    const { container } = render(<AuditAlertCards alerts={alerts({ failed_logins: 6 })} today="2026-10-19" />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/Look into it if the person says it was not them/);
    expect(text).toMatch(/Wrong sign-in attempt for victim@school.test/);
    expect(text).not.toMatch(/attack|hack|breach|intru|suspicious/i);
    for (const c of Object.values(ALERT_COPY)) expect(c.title + c.help).not.toMatch(/attack|hack|breach|intru/i);
  });

  it("every card links to the audit log, filtered, for the last 7 days", () => {
    render(<AuditAlertCards alerts={alerts({ receipts_cancelled: 2, failed_logins: 5 })} today="2026-10-19" />);
    for (const key of KEYS) {
      const href = alertHref(key, "2026-10-19");
      expect(href).toMatch(/^\/audit-log\?/);
      expect(href).toContain("from=2026-10-13");
      expect(href).toContain("to=2026-10-19");
      expect(document.querySelector(`a[href="${href}"]`)).toBeTruthy();
    }
    expect(alertHref("receipts_cancelled", "2026-10-19")).toContain("table=fee_receipts");
    expect(alertHref("failed_logins", "2026-10-19")).toContain("q=login_failed");
  });

  it("appears on the Admin dashboard only when the database sent alerts", () => {
    const data: AdminDashboardData = { counts: { classes: 1, sections: 1, subjects: 1, active_staff: 1 }, unmarked: [], pending_leave: 0, notices: [], translation: null, exam: { groups: 0, holidays: 0 }, diary: [] };
    const { rerender } = render(<AdminDashboardCards data={data} today="2026-10-19" deadline="15:30" />);
    expect(screen.queryByText(/Worth a look/)).toBeNull();
    rerender(<AdminDashboardCards data={{ ...data, alerts: alerts({ roles_changed: 1 }) }} today="2026-10-19" deadline="15:30" />);
    expect(screen.getByText(/Worth a look/)).toBeTruthy();
  });
});

describe("entry list", () => {
  const row: AuditRow = {
    id: 1, at: "2026-10-19T05:00:00Z", actor_id: "u1", actor_name: "Au Admin", actor_role: "computer_staff", action: "update", kind: "students", table: "students", table_label: "student",
    record_id: "r1", record_label: "Ravi", summary: "Changed student Ravi", changes: [{ field: "full name", before: "Ravi", after: "Ravi K" }, { field: "aadhaar no", before: "XXXXXXXX0123", after: "XXXXXXXX0999" }],
  };
  it("shows only the changed fields as before → after, with IDs as the database masked them", () => {
    const { container } = render(<AuditEntryList rows={[row]} />);
    const cells = within(container.querySelector("tbody tr") as HTMLElement);
    expect(cells.getByText("Changed student Ravi")).toBeTruthy();
    expect(container.textContent).toContain("full name");
    expect(container.textContent).toContain("XXXXXXXX0123");
    expect(container.textContent).not.toMatch(/\b[2-9][0-9]{11}\b/);
    expect(container.textContent).toContain("(office)");
  });
  it("Excel text lists only the changed fields", () => {
    expect(changesText(row.changes)).toBe("full name: Ravi → Ravi K; aadhaar no: XXXXXXXX0123 → XXXXXXXX0999");
  });
});

describe("filters", () => {
  it("default range is the last 7 days (India dates) and everything odd falls back", () => {
    const f = parseAuditFilters({}, "2026-10-19");
    expect(f).toMatchObject({ from: "2026-10-13", to: "2026-10-19", kind: "", actor: "", page: 1 });
    const bad = parseAuditFilters({ from: "x", kind: "hack", actor: "1; drop table", table: "A B", page: "-4" }, "2026-10-19");
    expect(bad).toMatchObject({ from: "2026-10-13", kind: "", actor: "", table: "", page: 1 });
  });
  it("the database call covers the whole last day and passes only what was chosen", () => {
    const a = auditRpcArgs(parseAuditFilters({ from: "2026-10-01", to: "2026-10-05", kind: "fees", q: " receipt " }, "2026-10-19"));
    expect(a).toMatchObject({ p_from: "2026-10-01T00:00:00+05:30", p_to: "2026-10-06T00:00:00+05:30", p_group: "fees", p_search: "receipt" });
    expect(a.p_actor).toBeUndefined();
  });
});

describe("History link and site map", () => {
  it("links to the one-record history", () => {
    render(<HistoryLink table="fee_receipts" id="abc" />);
    expect((screen.getByRole("link", { name: /History/ }) as HTMLAnchorElement).getAttribute("href")).toBe("/audit-log/history?table=fee_receipts&record=abc");
  });
  it("the audit log page is Admin only and built", () => {
    const p = findPage("/audit-log")!;
    expect(p.status).toBe("built");
    expect(canOpenPage(p, { role: "admin", duties: [] })).toBe(true);
    expect(canOpenPage(p, { role: "teacher", duties: ["student_records", "all_class_marks", "notices_diary"] })).toBe(false);
    expect(canOpenPage(p, { role: "computer_staff", duties: ["fee_collection", "student_records"] })).toBe(false);
  });
});
