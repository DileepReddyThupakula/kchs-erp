/** Pure helpers shared by server and client code of the Timetable module. */

export const WEEKDAYS = [
  { n: 1, short: "Mon", long: "Monday" },
  { n: 2, short: "Tue", long: "Tuesday" },
  { n: 3, short: "Wed", long: "Wednesday" },
  { n: 4, short: "Thu", long: "Thursday" },
  { n: 5, short: "Fri", long: "Friday" },
  { n: 6, short: "Sat", long: "Saturday" },
  { n: 7, short: "Sun", long: "Sunday" },
] as const;

/** Non-subject periods Admin can pick from (free text is allowed too). */
export const ACTIVITIES = ["Games", "Library", "Free", "Assembly", "Computer lab", "Art & craft"] as const;

export type SlotKind = "teaching" | "break" | "lunch";
export type Slot = { id: string; seq: number; kind: SlotKind; periodNo: number | null; label: string; start: string; end: string };

/** "13:20:00" -> "1:20" (the school's own 12-hour style, no am/pm). */
export function fmtTime(t: string | null | undefined) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")}`;
}
export const fmtRange = (s: string, e: string) => `${fmtTime(s)}–${fmtTime(e)}`;

export function weekdayOf(dateIso: string) {
  const d = new Date(dateIso + "T00:00:00Z").getUTCDay();
  return d === 0 ? 7 : d;
}
export function addDays(dateIso: string, n: number) {
  const d = new Date(dateIso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function mondayOf(dateIso: string) {
  return addDays(dateIso, 1 - weekdayOf(dateIso));
}

/** Everything the grids need to know about bell schedules. */
export type BellData = {
  schedules: { id: string; name: string; note: string | null; isDefault: boolean }[];
  periods: Record<string, Slot[]>; // schedule id -> ordered slots
  classSchedule: Record<string, string>; // `${classId}|${weekday}` -> schedule id
  defaultId: string | null;
};

export function slotsFor(bell: BellData, classId: string | null, weekday: number): Slot[] {
  const sid = (classId && bell.classSchedule[`${classId}|${weekday}`]) || bell.defaultId;
  return (sid && bell.periods[sid]) || [];
}
export const teachingSlots = (slots: Slot[]) => slots.filter((s) => s.kind === "teaching");

export type EntryLite = {
  id: string;
  sectionId: string;
  weekday: number;
  periodNo: number;
  subjectId: string | null;
  activity: string | null;
  teacherId: string | null;
  room: string | null;
};

export type StatusKind = "over" | "under" | "ok" | "no_target";
export const STATUS_TEXT: Record<StatusKind, string> = { over: "Over", under: "Short", ok: "OK", no_target: "No target" };
