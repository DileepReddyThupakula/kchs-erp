/** Pure helpers for the Attendance module (server + client). */
export type Status = "present" | "absent" | "late";
export type SessionName = "morning" | "afternoon";

export const STATUS_LABEL: Record<Status, string> = { present: "Present", absent: "Absent", late: "Late" };
/** One-letter mark used in registers (printed in black and white too). */
export const STATUS_MARK: Record<Status, string> = { present: "P", absent: "A", late: "L" };
export const SESSION_LABEL: Record<SessionName, string> = { morning: "Morning", afternoon: "Afternoon" };
export const KIND_LABEL: Record<string, string> = { regular: "Regular", substitute: "Substitute", correction: "Correction" };

/** Present and Late count as attended; Absent does not (DECISIONS AT3). */
export const attended = (s: string | null | undefined) => s === "present" || s === "late";

export type DayStatus = "present" | "absent" | "morning_only" | "afternoon_only" | "one_session_present" | "one_session_absent";
export const DAY_MARK: Record<DayStatus, string> = {
  present: "P",
  absent: "A",
  morning_only: "½M",
  afternoon_only: "½A",
  one_session_present: "P?",
  one_session_absent: "A?",
};
export const DAY_TEXT: Record<DayStatus, string> = {
  present: "Present (both sessions)",
  absent: "Absent (both sessions)",
  morning_only: "Half day: morning only",
  afternoon_only: "Half day: afternoon only",
  one_session_present: "Present (one session marked)",
  one_session_absent: "Absent (one session marked)",
};

export function monthRange(month: string) {
  // month = YYYY-MM
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const p = (n: number) => String(n).padStart(2, "0");
  return { from: `${y}-${p(m)}-01`, to: `${y}-${p(m)}-${p(last)}`, days: last, y, m };
}
export const dayOfWeek = (iso: string) => new Date(iso + "T00:00:00Z").getUTCDay(); // 0 = Sunday
export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
export const monthLabel = (month: string) =>
  new Date(month + "-01T00:00:00Z").toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
