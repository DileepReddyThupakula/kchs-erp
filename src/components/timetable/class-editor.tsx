"use client";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Copy, FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Badge, Card } from "@/components/ui/card";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { TimetableGrid, type GridCell } from "@/components/timetable/grid";
import { exportSheets } from "@/lib/export";
import { copyDay, saveCell } from "@/features/timetable/actions";
import { ACTIVITIES, WEEKDAYS, slotsFor, teachingSlots, type BellData, type EntryLite } from "@/features/timetable/shared";

export type EditorAssignment = { id: string; subjectId: string; subjectName: string; staffId: string; staffName: string; target: number | null };

export function ClassEditor({
  section,
  sectionLabels,
  bell,
  days,
  entries,
  otherEntries,
  assignments,
  teacherNames,
  subjectNames,
}: {
  section: { id: string; classId: string; label: string };
  sectionLabels: Record<string, string>;
  bell: BellData;
  days: number[];
  /** Entries of THIS section. */
  entries: EntryLite[];
  /** Entries of every other section (to show who is busy). */
  otherEntries: EntryLite[];
  assignments: EditorAssignment[];
  teacherNames: Record<string, string>;
  subjectNames: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cell, setCell] = useState<{ wd: number; p: number } | null>(null);
  const [copyOpen, setCopyOpen] = useState(false);

  const slotsByDay = useMemo(() => Object.fromEntries(days.map((d) => [d, slotsFor(bell, section.classId, d)])), [bell, section.classId, days]);
  const refDay = days.find((d) => slotsByDay[d]?.length) ?? days[0];
  const refSlots = slotsByDay[refDay] ?? [];
  const entryAt = (wd: number, p: number) => entries.find((e) => e.weekday === wd && e.periodNo === p);

  const cells = useMemo(() => {
    const out: Record<string, GridCell> = {};
    for (const e of entries) {
      out[`${e.weekday}|${e.periodNo}`] = e.subjectId
        ? { primary: subjectNames[e.subjectId] ?? "Subject", secondary: `${teacherNames[e.teacherId ?? ""] ?? ""}${e.room ? ` · ${e.room}` : ""}` }
        : { primary: e.activity ?? "", secondary: e.room ?? undefined };
    }
    return out;
  }, [entries, subjectNames, teacherNames]);

  // periods per week: scheduled vs target for each assignment
  const counts = assignments.map((a) => {
    const scheduled = entries.filter((e) => e.subjectId === a.subjectId && e.teacherId === a.staffId).length;
    return { ...a, scheduled };
  });
  const emptyCells: string[] = [];
  const orphans: string[] = [];
  for (const wd of days) {
    const valid = new Set(teachingSlots(slotsByDay[wd] ?? []).map((s) => s.periodNo));
    for (const p of valid) if (!entryAt(wd, p!)) emptyCells.push(`${WEEKDAYS[wd - 1].short} P${p}`);
    for (const e of entries.filter((x) => x.weekday === wd)) if (!valid.has(e.periodNo)) orphans.push(`${WEEKDAYS[wd - 1].short} P${e.periodNo}`);
  }
  const shortfalls = counts.filter((c) => c.target != null && c.scheduled < c.target);
  const overs = counts.filter((c) => c.target != null && c.scheduled > c.target);
  const clean = !shortfalls.length && !overs.length && !emptyCells.length && !orphans.length;

  async function exportXlsx() {
    const periods = teachingSlots(refSlots);
    await exportSheets(`timetable-${section.label}`, "xlsx", [
      {
        name: section.label,
        headers: ["Day", ...periods.map((s) => `P${s.periodNo}`)],
        rows: days.map((wd) => [
          WEEKDAYS[wd - 1].long,
          ...periods.map((s) => {
            const e = entryAt(wd, s.periodNo!);
            if (!e) return "";
            return e.subjectId ? `${subjectNames[e.subjectId] ?? ""} (${teacherNames[e.teacherId ?? ""] ?? ""})` : (e.activity ?? "");
          }),
        ]),
        widths: [14, ...periods.map(() => 26)],
      },
    ]);
  }

  return (
    <div className="grid gap-4 min-[1500px]:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setCopyOpen(true)}>
            <Copy className="size-4" /> Copy a day
          </Button>
          <Link href={`/print/timetable/class/${section.id}`} target="_blank" className={buttonClasses("secondary", "sm")}>
            <Printer className="size-4" aria-hidden /> Print
          </Link>
          <Button variant="secondary" size="sm" onClick={exportXlsx}>
            <FileSpreadsheet className="size-4" /> Excel
          </Button>
          <span className="text-xs text-muted">Click a period to set or change it.</span>
        </div>
        <TimetableGrid refSlots={refSlots} days={days} cells={cells} onCellClick={(wd, p) => setCell({ wd, p })} emptyLabel="+ Set" />
        {days.some((d) => slotsByDay[d] !== slotsByDay[refDay] && JSON.stringify(slotsByDay[d]?.map((s) => s.start)) !== JSON.stringify(refSlots.map((s) => s.start))) && (
          <p className="text-xs text-muted">Some days follow a different bell schedule. Period numbers match; times are shown for the first day.</p>
        )}
      </div>

      <div className="space-y-4">
        <Card className="p-0">
          <div className="border-b border-border px-4 py-3">
            <h3 className="font-semibold text-navy-900">Periods per week</h3>
            <p className="text-xs text-muted">Scheduled against each teacher&apos;s target.</p>
          </div>
          {counts.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted">No teachers are assigned to this section yet (School setup → Teacher assignments).</p>
          ) : (
            <ul className="divide-y divide-border text-sm">
              {counts.map((c) => {
                const st = c.target == null ? "no_target" : c.scheduled > c.target ? "over" : c.scheduled < c.target ? "under" : "ok";
                return (
                  <li key={c.id} className="flex items-center justify-between gap-2 px-4 py-2">
                    <span>
                      <span className="font-medium text-navy-900">{c.subjectName}</span>
                      <span className="block text-xs text-muted">{c.staffName}</span>
                    </span>
                    <span className="text-right">
                      <span className="tabular-nums font-semibold">
                        {c.scheduled}
                        {c.target != null ? ` / ${c.target}` : ""}
                      </span>
                      <span className="block">
                        <Badge tone={st === "ok" ? "success" : st === "no_target" ? "neutral" : "warning"}>
                          {st === "ok" ? "OK" : st === "over" ? `Over by ${c.scheduled - c.target!}` : st === "under" ? `Short by ${c.target! - c.scheduled}` : "No target"}
                        </Badge>
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card>
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-navy-900">
            {clean ? <CheckCircle2 className="size-4 text-peacock-700" aria-hidden /> : <AlertTriangle className="size-4 text-amber-700" aria-hidden />}
            {clean ? "No problems found" : "To fix"}
          </h3>
          {clean ? (
            <p className="text-sm text-muted">Every period is filled and every subject is at its weekly target.</p>
          ) : (
            <ul className="list-disc space-y-1 pl-5 text-sm">
              {shortfalls.map((c) => (
                <li key={c.id}>
                  {c.subjectName} ({c.staffName}) is {c.target! - c.scheduled} period(s) short of {c.target}.
                </li>
              ))}
              {overs.map((c) => (
                <li key={c.id}>
                  {c.subjectName} ({c.staffName}) has {c.scheduled - c.target!} more than the {c.target} planned.
                </li>
              ))}
              {emptyCells.length > 0 && (
                <li>
                  {emptyCells.length} empty period{emptyCells.length > 1 ? "s" : ""}: {emptyCells.slice(0, 8).join(", ")}
                  {emptyCells.length > 8 ? "…" : ""}
                </li>
              )}
              {orphans.length > 0 && <li>Periods that are not in that day&apos;s bell schedule any more: {orphans.join(", ")}. Clear them.</li>}
            </ul>
          )}
        </Card>
      </div>

      {cell && (
        <CellModal
          key={`${cell.wd}-${cell.p}`}
          onClose={() => setCell(null)}
          onSaved={() => {
            setCell(null);
            start(() => router.refresh());
          }}
          sectionId={section.id}
          wd={cell.wd}
          p={cell.p}
          existing={entryAt(cell.wd, cell.p)}
          assignments={counts}
          busy={(staffId) => otherEntries.find((e) => e.teacherId === staffId && e.weekday === cell.wd && e.periodNo === cell.p)}
          sectionLabels={sectionLabels}
        />
      )}
      {copyOpen && (
        <CopyModal
          sectionId={section.id}
          days={days}
          onClose={() => setCopyOpen(false)}
          onDone={() => {
            setCopyOpen(false);
            start(() => router.refresh());
          }}
        />
      )}
      {pending && <span className="sr-only">Refreshing…</span>}
    </div>
  );
}

function CellModal({
  onClose,
  onSaved,
  sectionId,
  wd,
  p,
  existing,
  assignments,
  busy,
  sectionLabels,
}: {
  onClose: () => void;
  onSaved: () => void;
  sectionId: string;
  wd: number;
  p: number;
  existing: EntryLite | undefined;
  assignments: (EditorAssignment & { scheduled: number })[];
  busy: (staffId: string) => EntryLite | undefined;
  sectionLabels: Record<string, string>;
}) {
  const initialMode = existing ? (existing.subjectId ? "subject" : "activity") : "subject";
  const [mode, setMode] = useState<"subject" | "activity">(initialMode);
  const [assignmentId, setAssignmentId] = useState(existing?.subjectId ? (assignments.find((a) => a.subjectId === existing.subjectId && a.staffId === existing.teacherId)?.id ?? "") : "");
  const known = (ACTIVITIES as readonly string[]).includes(existing?.activity ?? "");
  const [activity, setActivity] = useState(existing?.activity ? (known ? existing.activity : "__other") : "Games");
  const [other, setOther] = useState(existing?.activity && !known ? existing.activity : "");
  const [room, setRoom] = useState(existing?.room ?? "");
  const [error, setError] = useState("");
  const [busyNow, setBusyNow] = useState(false);

  const chosen = assignments.find((a) => a.id === assignmentId);
  const after = chosen ? chosen.scheduled + (existing?.subjectId === chosen.subjectId && existing?.teacherId === chosen.staffId ? 0 : 1) : null;

  async function submit(clear = false) {
    setError("");
    setBusyNow(true);
    const res = await saveCell({
      sectionId,
      weekday: wd,
      periodNo: p,
      mode: clear ? "clear" : mode,
      subjectId: chosen?.subjectId,
      teacherId: chosen?.staffId,
      activity: activity === "__other" ? other : activity,
      room,
    });
    setBusyNow(false);
    if (!res.ok) return setError(res.error);
    toast.success(res.message ?? "Saved.");
    onSaved();
  }

  return (
    <Modal
      open
      onClose={() => !busyNow && onClose()}
      title={`${WEEKDAYS[wd - 1].long}, period ${p}`}
      footer={
        <>
          {existing && (
            <Button variant="danger" className="mr-auto" disabled={busyNow} onClick={() => submit(true)}>
              Clear period
            </Button>
          )}
          <Button variant="secondary" disabled={busyNow} onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busyNow} onClick={() => submit(false)}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-foreground">
        <div role="radiogroup" aria-label="Type of period" className="inline-flex rounded-lg border border-border p-1 text-sm">
          {(
            [
              ["subject", "Subject period"],
              ["activity", "Games / Library / Free"],
            ] as const
          ).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={mode === v} onClick={() => setMode(v)} className={`rounded-md px-3 py-1.5 ${mode === v ? "bg-navy-900 font-medium text-gold-400" : "text-navy-800 hover:bg-navy-50"}`}>
              {l}
            </button>
          ))}
        </div>
        {mode === "subject" ? (
          <Field label="Subject and teacher" name="tt-assignment">
            <Select id="tt-assignment" value={assignmentId} onChange={(e) => setAssignmentId(e.target.value)}>
              <option value="">— choose —</option>
              {assignments.map((a) => {
                const b = busy(a.staffId);
                return (
                  <option key={a.id} value={a.id} disabled={!!b}>
                    {a.subjectName} — {a.staffName}
                    {b ? ` (busy: ${sectionLabels[b.sectionId] ?? "another class"})` : ""}
                  </option>
                );
              })}
            </Select>
            {chosen && after != null && (
              <p className="mt-1 text-xs text-muted">
                {chosen.subjectName} will have {after}
                {chosen.target != null ? ` of ${chosen.target}` : ""} period{after === 1 ? "" : "s"} a week.
              </p>
            )}
            {assignments.length === 0 && <p className="mt-1 text-xs text-amber-800">No teacher is assigned to this section yet.</p>}
          </Field>
        ) : (
          <>
            <Field label="Activity" name="tt-activity">
              <Select id="tt-activity" value={activity} onChange={(e) => setActivity(e.target.value)}>
                {ACTIVITIES.map((a) => (
                  <option key={a}>{a}</option>
                ))}
                <option value="__other">Other…</option>
              </Select>
            </Field>
            {activity === "__other" && (
              <Field label="Activity name" name="tt-other">
                <Input id="tt-other" value={other} onChange={(e) => setOther(e.target.value)} />
              </Field>
            )}
          </>
        )}
        <Field label="Room (optional)" name="tt-room">
          <Input id="tt-room" value={room} onChange={(e) => setRoom(e.target.value)} />
        </Field>
        {error && (
          <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}

function CopyModal({ sectionId, days, onClose, onDone }: { sectionId: string; days: number[]; onClose: () => void; onDone: () => void }) {
  const [from, setFrom] = useState(days[0]);
  const [to, setTo] = useState<number[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title="Copy a day"
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              const res = await copyDay({ sectionId, from, to });
              setBusy(false);
              if (!res.ok) return setError(res.error);
              toast.success(res.message ?? "Copied.");
              onDone();
            }}
          >
            Copy
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-foreground">
        <Field label="Copy from" name="copy-from">
          <Select
            id="copy-from"
            value={from}
            onChange={(e) => {
              setFrom(Number(e.target.value));
              setTo((t) => t.filter((d) => d !== Number(e.target.value)));
            }}
          >
            {days.map((d) => (
              <option key={d} value={d}>
                {WEEKDAYS[d - 1].long}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Copy to (replaces that whole day)</legend>
          <div className="flex flex-wrap gap-3">
            {days
              .filter((d) => d !== from)
              .map((d) => (
                <label key={d} className="inline-flex items-center gap-1.5 text-sm">
                  <input type="checkbox" className="size-4 accent-navy-700" checked={to.includes(d)} onChange={(e) => setTo((t) => (e.target.checked ? [...t, d] : t.filter((x) => x !== d)))} />
                  {WEEKDAYS[d - 1].long}
                </label>
              ))}
          </div>
        </fieldset>
        <p className="text-xs text-muted">A teacher who is busy elsewhere in a copied period cannot be copied; those periods are left empty so you can set them by hand.</p>
        {error && (
          <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        )}
      </div>
    </Modal>
  );
}
