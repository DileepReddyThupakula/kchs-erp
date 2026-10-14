"use client";
import { cn } from "@/lib/utils";
import { fmtRange, WEEKDAYS, type Slot } from "@/features/timetable/shared";

export type GridCell = {
  /** Main line, e.g. subject or class. */
  primary: string;
  secondary?: string;
  /** Small text tag such as "Covering" / "Relieved" (never colour-only meaning). */
  tag?: string;
  /** Struck through (a period the teacher was relieved of). */
  strike?: boolean;
  /** Plain time when this cell's time differs from the column header. */
  time?: string;
};

/**
 * Weekdays x periods. Breaks and lunch are narrow labelled columns taken from
 * the reference schedule. Cells are plain data so the same grid is used on the
 * class / teacher / My timetable pages and in print.
 */
export function TimetableGrid({
  refSlots,
  days,
  cells,
  todayWeekday,
  onCellClick,
  emptyLabel = "—",
  print = false,
  dayNote,
}: {
  refSlots: Slot[];
  days: number[];
  cells: Record<string, GridCell | undefined>;
  todayWeekday?: number;
  onCellClick?: (weekday: number, periodNo: number) => void;
  emptyLabel?: string;
  print?: boolean;
  dayNote?: Record<number, string>;
}) {
  const text = print ? "text-[9pt]" : "text-sm";
  return (
    <div className={cn(!print && "overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-soft)]")}>
      <table className={cn("w-full border-collapse", text)}>
        <thead>
          <tr className={cn(print ? "bg-white" : "bg-cream-100")}>
            <th scope="col" className={cn("border border-border px-2 py-2 text-left font-semibold", print ? "border-black" : "")}>
              Day
            </th>
            {refSlots.map((s) =>
              s.kind === "teaching" ? (
                <th key={s.id} scope="col" className={cn("min-w-28 border px-2 py-1.5 text-left", print ? "border-black" : "border-border")}>
                  <span className="font-semibold">P{s.periodNo}</span>
                  <span className="block text-[0.8em] font-normal tabular-nums text-muted">{fmtRange(s.start, s.end)}</span>
                </th>
              ) : (
                <th key={s.id} scope="col" className={cn("w-8 border px-0.5 py-1 text-center align-middle font-medium text-muted", print ? "border-black" : "border-border bg-cream-50")}>
                  <span className="block text-[0.75em] leading-tight [writing-mode:vertical-rl] mx-auto rotate-180">{s.label}</span>
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {days.map((wd) => {
            const isToday = todayWeekday === wd;
            return (
              <tr key={wd} className={cn(isToday && !print && "bg-gold-50")}>
                <th scope="row" className={cn("whitespace-nowrap border px-2 py-2 text-left font-semibold", print ? "border-black" : "border-border", isToday && !print && "text-navy-900")}>
                  {WEEKDAYS[wd - 1].long}
                  {isToday && !print && <span className="ml-1.5 rounded bg-navy-900 px-1.5 py-0.5 text-[0.7em] font-semibold text-gold-300">Today</span>}
                  {dayNote?.[wd] && <span className="block text-[0.75em] font-normal text-muted">{dayNote[wd]}</span>}
                </th>
                {refSlots.map((s) => {
                  if (s.kind !== "teaching") {
                    return <td key={s.id} className={cn("border", print ? "border-black bg-neutral-100" : "border-border bg-cream-50")} aria-hidden />;
                  }
                  const c = cells[`${wd}|${s.periodNo}`];
                  const inner = c ? (
                    <span className="block text-left">
                      {c.tag && <span className="mb-0.5 inline-block rounded border border-current px-1 text-[0.7em] font-semibold uppercase tracking-wide">{c.tag}</span>}
                      <span className={cn("block font-medium", c.strike && "line-through opacity-70")}>{c.primary}</span>
                      {c.secondary && <span className={cn("block text-[0.85em] text-muted", c.strike && "line-through")}>{c.secondary}</span>}
                      {c.time && <span className="block text-[0.75em] tabular-nums text-muted">{c.time}</span>}
                    </span>
                  ) : (
                    <span className="block text-muted">{emptyLabel}</span>
                  );
                  return (
                    <td key={s.id} className={cn("border p-0 align-top", print ? "border-black" : "border-border")}>
                      {onCellClick ? (
                        <button
                          type="button"
                          onClick={() => onCellClick(wd, s.periodNo!)}
                          aria-label={`${WEEKDAYS[wd - 1].long} period ${s.periodNo}${c ? `: ${c.primary}` : ": empty"}`}
                          className="block h-full min-h-14 w-full px-2 py-1.5 text-left hover:bg-navy-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-500"
                        >
                          {inner}
                        </button>
                      ) : (
                        <div className="min-h-12 px-2 py-1.5">{inner}</div>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
