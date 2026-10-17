// Teacher / office dashboards are pure display of staff_dashboard(); fee numbers appear only when the database sent them.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/features/timetable/queries", () => ({ getSectionsInfo: vi.fn() }));
vi.mock("@/features/notices/queries", () => ({ signedLinks: vi.fn() }));

import { StaffDashboardCards, type StaffDashboardData } from "@/components/dashboard/staff-cards";
import { AdminDashboardCards, type AdminDashboardData } from "@/components/dashboard/admin-cards";

const base: StaffDashboardData = {
  counts: { sections: 3, subjects: 1, students: 114 },
  next_holiday: null,
  sessions: [{ section_id: "s1", section_label: "Class 9 – A", session: "morning", marked: false }],
  unmarked: null,
  notices: [{ id: "n1", title: "Staff meeting", circular_no: "C/1", important: false, publish_date: "2026-10-17", read: false }],
  marks_to_enter: [{ section_label: "Class 9 – A", subject: "Mathematics", exam: "FA3", missing: 15 }],
  today: [{ period_no: 1, kind: "regular", section_id: "s1", section_label: "Class 9 – A", subject_name: "Mathematics", activity: null, start_time: "09:00:00", end_time: "09:45:00" }],
  diary_sections: 3,
  diary_todo: [{ section_id: "s1", section_label: "Class 9 – A", subject: "Mathematics", status: "draft", reminded: true }, { section_id: "s1", section_label: "Class 9 – A", subject: null, status: "new", reminded: false }],
  diary_board: null,
  fees: null,
};
afterEach(cleanup);

describe("teacher dashboard", () => {
  it("shows their sessions, diary to submit, marks to enter and today's periods", () => {
    render(<StaffDashboardCards data={base} today="2026-10-19" deadline="15:30" isTeacher />);
    expect(screen.getByText("Sessions to mark now")).toBeTruthy();
    expect(screen.getByText("2 to do")).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(screen.getByText("Not started")).toBeTruthy();
    expect(screen.getByText("Reminder")).toBeTruthy();
    expect(screen.getByText(/Class remark/)).toBeTruthy();
    expect(screen.getByText("15 to enter")).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("1 unread")).toBeTruthy();
  });
  it("shows no fee number, tile or link at all", () => {
    const { container } = render(<StaffDashboardCards data={base} today="2026-10-19" deadline="15:30" isTeacher />);
    expect(container.textContent).not.toMatch(/₹|Collected today|Overdue|Receipts today/);
    expect(container.querySelector('a[href^="/fees"]')).toBeNull();
    expect(screen.queryByLabelText("Fees today")).toBeNull();
  });
  it("no all-classes attendance list or diary board without those duties", () => {
    render(<StaffDashboardCards data={base} today="2026-10-19" deadline="15:30" isTeacher />);
    expect(screen.queryByText("Attendance not yet marked")).toBeNull();
    expect(screen.queryByText(/Diary: classes pending/)).toBeNull();
  });
});

describe("office dashboard", () => {
  const office: StaffDashboardData = { ...base, counts: { sections: 0, subjects: 0, students: 0 }, sessions: [], marks_to_enter: [], today: [], diary_sections: 0, diary_todo: [] };
  it("with fee access: today's fee numbers", () => {
    render(<StaffDashboardCards data={{ ...office, fees: { collected_today_paise: 1234500, receipts_today: 3, overdue_paise: 9900000 } }} today="2026-10-19" deadline="15:30" isTeacher={false} />);
    expect(screen.getByLabelText("Fees today").textContent).toMatch(/₹12,345.*Collected today.*3.*Receipts today.*₹99,000.*Overdue now/);
  });
  it("without fee access: none, and no teacher cards either", () => {
    const { container } = render(<StaffDashboardCards data={office} today="2026-10-19" deadline="15:30" isTeacher={false} />);
    expect(container.textContent).not.toMatch(/₹|Collected today/);
    expect(screen.queryByText("Today")).toBeNull();
    expect(screen.queryByText("Diary to submit today")).toBeNull();
    expect(screen.queryByText("Sessions to mark now")).toBeNull();
  });
  it("with the attendance and diary duties: the all-classes list and the board", () => {
    render(<StaffDashboardCards data={{ ...office, unmarked: [{ section_id: "s2", section_label: "Class 6 – A", session: "morning", staff_name: null }], diary_board: [{ section_id: "s2", label: "Class 6 – A", class_order: 6, expected: 4, submitted: 1, published: 0, pending: 1, skipped: 0 }] }} today="2026-10-19" deadline="15:30" isTeacher={false} />);
    expect(screen.getByText("Attendance not yet marked")).toBeTruthy();
    expect(screen.getByText("Diary: classes pending or late today")).toBeTruthy();
  });
});

describe("admin dashboard fee tiles", () => {
  const admin: AdminDashboardData = { counts: { classes: 13, sections: 13, subjects: 12, active_staff: 25 }, unmarked: [], pending_leave: 0, notices: [], translation: { used: 0, cap: 0 }, exam: { groups: 0, holidays: 0 }, diary: [] };
  it("appear when the database sent them", () => {
    render(<AdminDashboardCards data={{ ...admin, fees: { collected_today_paise: 50000, receipts_today: 1, overdue_paise: 100, defaulters: 4 }, attendance_today: { students_marked: 200, students_present: 190 } }} today="2026-10-19" deadline="15:30" />);
    expect(screen.getByLabelText("Fees today").textContent).toMatch(/₹500.*Students owing/);
    expect(screen.getByText(/Students present today/).textContent).toMatch(/95%/);
  });
  it("and not when it did not", () => {
    render(<AdminDashboardCards data={{ ...admin, fees: null }} today="2026-10-19" deadline="15:30" />);
    expect(screen.queryByLabelText("Fees today")).toBeNull();
  });
});
