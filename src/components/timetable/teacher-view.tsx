"use client";
import { useMemo } from "react";
import { FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { TimetableGrid, type GridCell } from "@/components/timetable/grid";
import { exportSheets } from "@/lib/export";
import { WEEKDAYS, slotsFor, teachingSlots, type BellData, type EntryLite } from "@/features/timetable/shared";

/** Read-only weekly grid for one teacher (periods across every section). */
export function TeacherView({
  teacherName,
  bell,
  days,
  entries,
  sectionLabel,
  subjectNames,
}: {
  teacherName: string;
  bell: BellData;
  days: number[];
  entries: EntryLite[];
  sectionLabel: Record<string, string>;
  subjectNames: Record<string, string>;
}) {
  // period times come from the default schedule (class schedules can differ by weekday)
  const refSlots = useMemo(() => slotsFor(bell, null, days[0]), [bell, days]);
  const cells = useMemo(() => {
    const out: Record<string, GridCell> = {};
    for (const e of entries) {
      out[`${e.weekday}|${e.periodNo}`] = {
        primary: sectionLabel[e.sectionId] ?? "Section",
        secondary: `${e.subjectId ? (subjectNames[e.subjectId] ?? "") : (e.activity ?? "")}${e.room ? ` · ${e.room}` : ""}`,
      };
    }
    return out;
  }, [entries, sectionLabel, subjectNames]);
  const perDay = days.map((d) => entries.filter((e) => e.weekday === d).length);

  async function exportXlsx() {
    const periods = teachingSlots(refSlots);
    await exportSheets(`teacher-timetable-${teacherName}`, "xlsx", [
      {
        name: teacherName,
        headers: ["Day", ...periods.map((s) => `P${s.periodNo}`)],
        rows: days.map((wd) => [
          WEEKDAYS[wd - 1].long,
          ...periods.map((s) => {
            const e = entries.find((x) => x.weekday === wd && x.periodNo === s.periodNo);
            return e ? `${sectionLabel[e.sectionId] ?? ""} – ${e.subjectId ? (subjectNames[e.subjectId] ?? "") : (e.activity ?? "")}` : "";
          }),
        ]),
        widths: [14, ...periods.map(() => 28)],
      },
    ]);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <Card className="px-4 py-2">
          <span className="text-xs text-muted">Periods a week</span>
          <span className="ml-2 text-lg font-semibold tabular-nums text-navy-900">{entries.length}</span>
        </Card>
        <span className="text-xs text-muted">{days.map((d, i) => `${WEEKDAYS[d - 1].short} ${perDay[i]}`).join(" · ")}</span>
        <Button variant="secondary" size="sm" className="ml-auto" onClick={exportXlsx}>
          <FileSpreadsheet className="size-4" /> Excel
        </Button>
      </div>
      <TimetableGrid refSlots={refSlots} days={days} cells={cells} emptyLabel="Free" />
    </div>
  );
}
