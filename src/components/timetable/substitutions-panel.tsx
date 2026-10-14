"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2, UserRoundCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/form";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { addSubstitution, getFreeTeachersBatch, removeSubstitution } from "@/features/timetable/actions";
import { WEEKDAYS, type EntryLite } from "@/features/timetable/shared";

export type SubRow = { id: string; periodNo: number; sectionId: string; section: string; subject: string; original: string; substitute: string; reason: string; enteredBy: string };

export function SubstitutionsPanel({
  date,
  weekday,
  isSchoolDay,
  dayNote,
  entries,
  sectionLabels,
  teacherNames,
  subjectNames,
  subs,
  times,
  leavePeriods,
}: {
  date: string;
  weekday: number;
  isSchoolDay: boolean;
  dayNote: string | null;
  /** Entries of this weekday for every section (editors see all). */
  entries: EntryLite[];
  sectionLabels: Record<string, string>;
  teacherNames: Record<string, string>;
  subjectNames: Record<string, string>;
  subs: SubRow[];
  /** period number -> "9:00–9:40" (default schedule) */
  times: Record<number, string>;
  /** Periods left uncovered by approved leave on this date. */
  leavePeriods: { staffId: string; staff: string; type: string; sectionId: string; section: string; periodNo: number; covered: boolean }[];
}) {
  const router = useRouter();
  const [dateInput, setDateInput] = useState(date);
  const [teacherId, setTeacherId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [reason, setReason] = useState("");

  const covered = new Set(subs.map((s) => `${s.sectionId}|${s.periodNo}`));
  const withTeacher = entries.filter((e) => e.teacherId);
  const teachersToday = useMemo(() => {
    const ids = [...new Set(withTeacher.map((e) => e.teacherId!))];
    return ids.map((id) => ({ id, name: teacherNames[id] ?? "Teacher", n: withTeacher.filter((e) => e.teacherId === id).length })).sort((a, b) => a.name.localeCompare(b.name));
  }, [withTeacher, teacherNames]);
  const teacherPeriods = withTeacher.filter((e) => e.teacherId === teacherId).sort((a, b) => a.periodNo - b.periodNo);
  const sectionOptions = [...new Set(withTeacher.map((e) => e.sectionId))].sort((a, b) => (sectionLabels[a] ?? "").localeCompare(sectionLabels[b] ?? ""));
  const sectionPeriods = withTeacher.filter((e) => e.sectionId === sectionId).sort((a, b) => a.periodNo - b.periodNo);

  // one round trip for every period shown (free teachers per period)
  const [freeMap, setFreeMap] = useState<Record<string, { id: string; name: string; code: string; load: number }[]> | null>(null);
  const leaveEntries = leavePeriods
    .filter((l) => !l.covered && !covered.has(`${l.sectionId}|${l.periodNo}`))
    .map((l) => ({ l, e: { id: `${l.staffId}-${l.sectionId}-${l.periodNo}`, sectionId: l.sectionId, weekday, periodNo: l.periodNo, subjectId: null, activity: null, teacherId: l.staffId, room: null } as EntryLite }));
  const shown = [...(teacherId ? teacherPeriods : []), ...(sectionId ? sectionPeriods : []), ...leaveEntries.map((x) => x.e)].filter((e) => !covered.has(`${e.sectionId}|${e.periodNo}`));
  const shownKey = shown.map((e) => `${e.periodNo}|${e.teacherId}`).join(",") + date + subs.length;
  useEffect(() => {
    if (!shown.length) return;
    let live = true;
    setFreeMap(null);
    getFreeTeachersBatch(date, shown.map((e) => ({ periodNo: e.periodNo, excludeId: e.teacherId ?? undefined }))).then((m) => live && setFreeMap(m));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shownKey]);

  const columns: Column<SubRow>[] = [
    {
      id: "class",
      header: "Period · class",
      hideable: false,
      pinned: "left",
      cell: (r) => (
        <span className="font-medium text-navy-900">
          P{r.periodNo} · {r.section}
        </span>
      ),
      sortValue: (r) => r.periodNo,
      exportValue: (r) => `P${r.periodNo} ${r.section}`,
      className: "whitespace-nowrap",
    },
    { id: "subject", header: "Subject", cell: (r) => r.subject, sortValue: (r) => r.subject },
    { id: "original", header: "Absent teacher", cell: (r) => r.original, sortValue: (r) => r.original },
    { id: "substitute", header: "Substitute", cell: (r) => <span className="font-medium">{r.substitute}</span>, sortValue: (r) => r.substitute },
    { id: "reason", header: "Reason", cell: (r) => r.reason || <span className="text-muted">—</span>, sortValue: (r) => r.reason },
    { id: "by", header: "Entered by", cell: (r) => r.enteredBy, sortValue: (r) => r.enteredBy, defaultHidden: true },
  ];

  return (
    <div className="space-y-4">
      <Card>
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (dateInput) router.push(`/timetable/substitutions?date=${dateInput}`);
          }}
        >
          <Field label="Date" name="sub-date">
            <Input id="sub-date" type="date" value={dateInput} onChange={(e) => setDateInput(e.target.value)} className="w-44" />
          </Field>
          <Button type="submit" variant="secondary">
            Show this day
          </Button>
          <p className="pb-2 text-sm text-muted">
            {WEEKDAYS[weekday - 1].long}
            {dayNote ? ` · ${dayNote}` : ""}
          </p>
        </form>
      </Card>

      {isSchoolDay && leavePeriods.length > 0 && (
        <Card className="space-y-2 border-gold-200 bg-gold-50/60">
          <h3 className="font-semibold text-navy-900">Periods affected by approved leave ({leaveEntries.length} still to cover)</h3>
          {leaveEntries.length === 0 ? (
            <p className="text-sm text-peacock-700">Every period of the teachers on approved leave is covered.</p>
          ) : (
            <ul className="divide-y divide-border">
              {leaveEntries.map(({ l, e }) => (
                <AssignRow
                  key={e.id}
                  date={date}
                  entry={e}
                  label={`${l.staff} (${l.type} leave) · ${l.section}`}
                  time={times[e.periodNo]}
                  covered={false}
                  free={freeMap ? (freeMap[`${e.periodNo}|${e.teacherId ?? ""}`] ?? []) : null}
                  reason={reason || `${l.type} leave`}
                  onDone={() => router.refresh()}
                />
              ))}
            </ul>
          )}
        </Card>
      )}

      {!isSchoolDay ? (
        <Card>
          <p className="text-sm text-amber-800">This date is not a school day{dayNote ? ` (${dayNote})` : ""}, so there is nothing to cover.</p>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="space-y-3">
              <h3 className="font-semibold text-navy-900">Teacher absent</h3>
              <Select aria-label="Absent teacher" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">— choose the absent teacher —</option>
                {teachersToday.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.n} period{t.n === 1 ? "" : "s"} today)
                  </option>
                ))}
              </Select>
              {teacherId && (
                <ul className="divide-y divide-border">
                  {teacherPeriods.map((e) => (
                    <AssignRow
                      key={e.id}
                      date={date}
                      entry={e}
                      label={`${sectionLabels[e.sectionId]} · ${e.subjectId ? subjectNames[e.subjectId] : e.activity}`}
                      time={times[e.periodNo]}
                      covered={covered.has(`${e.sectionId}|${e.periodNo}`)}
                      free={freeMap ? (freeMap[`${e.periodNo}|${e.teacherId ?? ""}`] ?? []) : null}
                      reason={reason}
                      onDone={() => router.refresh()}
                    />
                  ))}
                </ul>
              )}
            </Card>
            <Card className="space-y-3">
              <h3 className="font-semibold text-navy-900">Or choose a class and period</h3>
              <Select aria-label="Class" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
                <option value="">— choose a class —</option>
                {sectionOptions.map((id) => (
                  <option key={id} value={id}>
                    {sectionLabels[id]}
                  </option>
                ))}
              </Select>
              {sectionId && (
                <ul className="divide-y divide-border">
                  {sectionPeriods.map((e) => (
                    <AssignRow
                      key={e.id}
                      date={date}
                      entry={e}
                      label={`${e.subjectId ? subjectNames[e.subjectId] : e.activity} · ${teacherNames[e.teacherId!] ?? ""}`}
                      time={times[e.periodNo]}
                      covered={covered.has(`${e.sectionId}|${e.periodNo}`)}
                      free={freeMap ? (freeMap[`${e.periodNo}|${e.teacherId ?? ""}`] ?? []) : null}
                      reason={reason}
                      onDone={() => router.refresh()}
                    />
                  ))}
                </ul>
              )}
            </Card>
          </div>
          <Field label="Reason for these substitutions (optional)" name="sub-reason">
            <Input id="sub-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Medical leave" className="max-w-md" />
          </Field>
        </>
      )}

      <div>
        <h3 className="mb-2 font-semibold text-navy-900">Substitutions on this day ({subs.length})</h3>
        <DataTable
          id="substitutions"
          rows={subs}
          columns={columns}
          getRowId={(r) => r.id}
          searchText={(r) => `${r.section} ${r.subject} ${r.original} ${r.substitute} ${r.reason}`}
          exportName={`substitutions-${date}`}
          rowLabel={(r) => `P${r.periodNo} ${r.section}`}
          rowActions={(r) => [
            {
              id: "remove",
              kind: "menu",
              label: "Remove substitution",
              icon: Trash2,
              tone: "danger",
              confirm: { title: "Remove this substitution?", message: `${r.original} will be the teacher of P${r.periodNo} in ${r.section} again.`, confirmLabel: "Remove", danger: true },
              onClick: async () => {
                const res = await removeSubstitution(r.id);
                if (!res.ok) toast.error(res.error);
                else {
                  toast.success(res.message ?? "Removed.");
                  router.refresh();
                }
              },
            },
          ]}
          emptyTitle="No substitutions on this day"
          emptyMessage="Choose the absent teacher or a class above."
        />
      </div>
    </div>
  );
}

function AssignRow({
  date,
  entry,
  label,
  time,
  covered,
  free,
  reason,
  onDone,
}: {
  date: string;
  entry: EntryLite;
  label: string;
  time?: string;
  covered: boolean;
  free: { id: string; name: string; code: string; load: number }[] | null;
  reason: string;
  onDone: () => void;
}) {
  const [pick, setPick] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <li className="flex flex-wrap items-center gap-2 py-2 text-sm">
      <span className="min-w-0 flex-1">
        <span className="font-medium text-navy-900">P{entry.periodNo}</span>
        {time && <span className="ml-1.5 text-xs tabular-nums text-muted">{time}</span>}
        <span className="block truncate text-muted">{label}</span>
      </span>
      {covered ? (
        <span className="inline-flex items-center gap-1 text-peacock-700">
          <UserRoundCheck className="size-4" aria-hidden /> Covered
        </span>
      ) : (
        <>
          <Select aria-label={`Free teacher for period ${entry.periodNo}`} value={pick} onChange={(e) => setPick(e.target.value)} className="w-52" disabled={free === null}>
            <option value="">{free === null ? "Loading…" : free.length ? "— free teacher —" : "No teacher is free"}</option>
            {(free ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.load} today)
              </option>
            ))}
          </Select>
          <Button
            size="sm"
            disabled={!pick || busy}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              const res = await addSubstitution({ date, sectionId: entry.sectionId, periodNo: entry.periodNo, substituteId: pick, reason });
              setBusy(false);
              if (!res.ok) return toast.error(res.error);
              toast.success(res.message ?? "Saved.");
              onDone();
            }}
          >
            Assign
          </Button>
        </>
      )}
    </li>
  );
}

