// The Admin dashboard's cards are pure display of what public.admin_dashboard() returns.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/features/timetable/queries", () => ({ getSectionsInfo: vi.fn() }));
vi.mock("@/features/notices/queries", () => ({ signedLinks: vi.fn() }));

import { AdminDashboardCards, type AdminDashboardData } from "@/components/dashboard/admin-cards";

const empty: AdminDashboardData = {
  counts: { classes: 13, sections: 13, subjects: 12, active_staff: 12 },
  unmarked: [],
  pending_leave: 0,
  notices: [],
  translation: { used: 0, cap: 0 },
  exam: { groups: 0, holidays: 0 },
  diary: [],
};
const base = (o: Partial<AdminDashboardData>): AdminDashboardData => ({ ...empty, ...o });
afterEach(cleanup);

describe("Admin dashboard cards", () => {
  it("shows the calm state when nothing is pending", () => {
    render(<AdminDashboardCards data={empty} today="2026-10-19" deadline="15:30" />);
    expect(screen.getByText("No current notices.")).toBeTruthy();
    expect(screen.getByText(/Everything for today is marked/)).toBeTruthy();
    expect(screen.getByText("Every class with a diary today is published.")).toBeTruthy();
    expect(screen.queryByText("Before printing report cards")).toBeNull();
    expect(screen.queryByText(/Telugu translation/)).toBeNull();
  });

  it("pins important notices, counts unread and shows read counts", () => {
    const notices = [
      { id: "n1", title: "Annual Day", circular_no: "KCHS/7", important: true, publish_date: "2026-10-17", read: false, read_count: 3, total: 12 },
      { id: "n2", title: "Holiday", circular_no: "KCHS/8", important: false, publish_date: "2026-10-16", read: true, read_count: 12, total: 12 },
    ];
    render(<AdminDashboardCards data={base({ notices })} today="2026-10-19" deadline="15:30" />);
    expect(screen.getByText("Important · KCHS/7")).toBeTruthy();
    expect(screen.getByText("Unread")).toBeTruthy();
    expect(screen.getByText("1 unread")).toBeTruthy();
    expect(screen.getByText("read 3/12")).toBeTruthy();
    expect(screen.getByText("read 12/12")).toBeTruthy();
  });

  it("lists unmarked attendance and the leave waiting", () => {
    const unmarked = [{ section_id: "s1", section_label: "Class 6 – A", session: "morning", staff_name: null }];
    render(<AdminDashboardCards data={base({ unmarked, pending_leave: 4 })} today="2026-10-19" deadline="15:30" />);
    expect(screen.getByText("Class 6 – A")).toBeTruthy();
    expect(screen.getByText("nobody assigned")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("warns at 80% of the translation limit and says 'switched off' at 100%", () => {
    render(<AdminDashboardCards data={base({ translation: { used: 80, cap: 100 } })} today="2026-10-19" deadline="15:30" />);
    expect(screen.getByText(/80% of this month/)).toBeTruthy();
    cleanup();
    render(<AdminDashboardCards data={base({ translation: { used: 100, cap: 100 } })} today="2026-10-19" deadline="15:30" />);
    expect(screen.getByText(/switched off until next month/)).toBeTruthy();
    cleanup();
    render(<AdminDashboardCards data={base({ translation: { used: 79, cap: 100 } })} today="2026-10-19" deadline="15:30" />);
    expect(screen.queryByText(/Telugu translation/)).toBeNull();
  });

  it("reminds about holidays once exams exist", () => {
    render(<AdminDashboardCards data={base({ exam: { groups: 5, holidays: 0 } })} today="2026-10-19" deadline="15:30" />);
    expect(screen.getByText(/none has been added yet/)).toBeTruthy();
    cleanup();
    render(<AdminDashboardCards data={base({ exam: { groups: 5, holidays: 7 } })} today="2026-10-19" deadline="15:30" />);
    expect(screen.getByText(/7 added so far/)).toBeTruthy();
  });

  it("the diary card lists classes still pending today and hides published ones", () => {
    const diary = [
      { section_id: "a", label: "Class 6 – A", class_order: 6, expected: 5, submitted: 2, published: 0, pending: 2, skipped: 0 },
      { section_id: "b", label: "Class 7 – A", class_order: 7, expected: 5, submitted: 5, published: 5, pending: 0, skipped: 0 },
      { section_id: "c", label: "Class 8 – A", class_order: 8, expected: 0, submitted: 0, published: 0, pending: 0, skipped: 0 },
    ];
    render(<AdminDashboardCards data={base({ diary })} today="2026-10-19" deadline="15:30" />);
    expect(screen.getByText("Class 6 – A")).toBeTruthy();
    expect(screen.queryByText("Class 7 – A")).toBeNull();
    expect(screen.queryByText("Class 8 – A")).toBeNull();
    expect(screen.getByText("2/5 in")).toBeTruthy();
  });
});
