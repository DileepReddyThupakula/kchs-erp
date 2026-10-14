"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { ConfirmDialog, Modal } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { createSchedule, deleteSchedule, savePeriods, setClassSchedule, updateSchedule } from "@/features/timetable/actions";
import { WEEKDAYS, type BellData, type Slot } from "@/features/timetable/shared";

type Row = { key: string; id: string | null; kind: "teaching" | "break" | "lunch"; label: string; start: string; end: string };
const hhmm = (t: string) => t.slice(0, 5);
const toRows = (slots: Slot[]): Row[] => slots.map((s) => ({ key: s.id, id: s.id, kind: s.kind, label: s.label, start: hhmm(s.start), end: hhmm(s.end) }));

export function BellEditor({
  bell,
  classes,
  days,
  selectedId,
}: {
  bell: BellData;
  classes: { id: string; name: string }[];
  days: number[];
  selectedId: string;
}) {
  const router = useRouter();
  const sel = bell.schedules.find((s) => s.id === selectedId) ?? bell.schedules[0];
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [copy, setCopy] = useState(true);

  const classRows = classes.map((c) => ({ ...c }));
  const used = (id: string) => Object.values(bell.classSchedule).filter((v) => v === id).length;

  const classCols: Column<{ id: string; name: string }>[] = [
    { id: "class", header: "Class", hideable: false, pinned: "left", cell: (c) => <span className="font-medium text-navy-900">{c.name}</span>, sortValue: (c) => c.name, className: "whitespace-nowrap" },
    ...days.map<Column<{ id: string; name: string }>>((d) => ({
      id: `d${d}`,
      header: WEEKDAYS[d - 1].short,
      cell: (c) => (
        <Select
          aria-label={`${c.name} ${WEEKDAYS[d - 1].long} schedule`}
          className="min-w-36"
          value={bell.classSchedule[`${c.id}|${d}`] ?? ""}
          onChange={async (e) => {
            const res = await setClassSchedule(c.id, d, e.target.value || null);
            if (!res.ok) toast.error(res.error);
            else router.refresh();
          }}
        >
          <option value="">Default</option>
          {bell.schedules
            .filter((s) => !s.isDefault)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
        </Select>
      ),
      exportValue: (c) => bell.schedules.find((s) => s.id === bell.classSchedule[`${c.id}|${d}`])?.name ?? "Default",
    })),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        {bell.schedules.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => router.push(`/timetable/bell-schedule?schedule=${s.id}`)}
            aria-pressed={s.id === sel?.id}
            className={`rounded-lg border px-3 py-1.5 text-sm ${s.id === sel?.id ? "border-navy-900 bg-navy-900 font-medium text-gold-400" : "border-border bg-surface text-navy-800 hover:bg-navy-50"}`}
          >
            {s.name}
            {s.isDefault && <span className="ml-1.5 text-xs opacity-80">(default)</span>}
          </button>
        ))}
        <Button variant="secondary" size="sm" onClick={() => setNewOpen(true)}>
          <Plus className="size-4" /> New schedule
        </Button>
      </div>

      {sel && <ScheduleCard key={sel.id} sel={sel} slots={bell.periods[sel.id] ?? []} usedBy={used(sel.id)} onChanged={() => router.refresh()} />}

      <div>
        <h2 className="mb-1 text-lg font-semibold text-navy-900">Schedule for each class and weekday</h2>
        <p className="mb-3 text-sm text-muted">Every class follows the default schedule unless you choose another one here (for example a shorter day for Nursery to UKG, or a half-day Saturday).</p>
        <DataTable
          id="class-bell-schedules"
          rows={classRows}
          columns={classCols}
          getRowId={(c) => c.id}
          searchText={(c) => c.name}
          pageSize={20}
          exportName="class-bell-schedules"
          rowLabel={(c) => c.name}
          rowActions={(c) => [
            {
              id: "reset",
              kind: "menu",
              label: "Use the default every day",
              icon: RotateCcw,
              onClick: async () => {
                for (const d of days) if (bell.classSchedule[`${c.id}|${d}`]) await setClassSchedule(c.id, d, null);
                toast.success(`${c.name} follows the default schedule.`);
                router.refresh();
              },
            },
          ]}
        />
      </div>

      <Modal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        title="New bell schedule"
        footer={
          <>
            <Button variant="secondary" onClick={() => setNewOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                const res = await createSchedule(newName, copy ? sel?.id : undefined);
                if (!res.ok) return toast.error(res.error);
                setNewOpen(false);
                setNewName("");
                toast.success("Schedule created. Now set its times.");
                router.push(`/timetable/bell-schedule?schedule=${res.id}`);
              }}
            >
              Create
            </Button>
          </>
        }
      >
        <div className="space-y-3 text-foreground">
          <Field label="Name" name="new-sched">
            <Input id="new-sched" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Half-day Saturday" />
          </Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-navy-700" checked={copy} onChange={(e) => setCopy(e.target.checked)} />
            Start from a copy of “{sel?.name}”
          </label>
        </div>
      </Modal>
    </div>
  );
}

function ScheduleCard({ sel, slots, usedBy, onChanged }: { sel: BellData["schedules"][number]; slots: Slot[]; usedBy: number; onChanged: () => void }) {
  const [rows, setRows] = useState<Row[]>(() => toRows(slots));
  const [name, setName] = useState(sel.name);
  const [note, setNote] = useState(sel.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  let n = 0;
  const numbered = [...rows].sort((a, b) => a.start.localeCompare(b.start)).map((r) => ({ ...r, no: r.kind === "teaching" ? ++n : null }));
  const noOf = new Map(numbered.map((r) => [r.key, r.no]));
  const set = (key: string, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const add = (kind: Row["kind"]) => {
    const last = numbered[numbered.length - 1];
    const start = last ? last.end : "09:00";
    const [h, m] = start.split(":").map(Number);
    const endMin = h * 60 + m + (kind === "teaching" ? 40 : 10);
    const end = `${String(Math.floor(endMin / 60) % 24).padStart(2, "0")}:${String(endMin % 60).padStart(2, "0")}`;
    setRows((rs) => [...rs, { key: crypto.randomUUID(), id: null, kind, label: kind === "teaching" ? "" : kind === "lunch" ? "Lunch" : "Short break", start, end }]);
  };

  async function save() {
    setError("");
    setBusy(true);
    const meta = await updateSchedule(sel.id, { name, note });
    if (!meta.ok) {
      setBusy(false);
      return setError(meta.error);
    }
    const res = await savePeriods(
      sel.id,
      rows.map((r) => ({ id: r.id, kind: r.kind, label: r.kind === "teaching" ? "" : r.label, start: r.start, end: r.end })),
    );
    setBusy(false);
    if (!res.ok) return setError(res.error);
    toast.success("Bell schedule saved.");
    onChanged();
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Schedule name" name="sched-name">
          <Input id="sched-name" value={name} onChange={(e) => setName(e.target.value)} className="w-60" />
        </Field>
        <Field label="Note (optional)" name="sched-note">
          <Input id="sched-note" value={note} onChange={(e) => setNote(e.target.value)} className="w-72" />
        </Field>
        <div className="ml-auto flex flex-wrap items-center gap-2 pb-0.5">
          {sel.isDefault ? (
            <Badge tone="gold">Default schedule</Badge>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const r = await updateSchedule(sel.id, { isDefault: true });
                if (!r.ok) toast.error(r.error);
                else {
                  toast.success("This is now the default schedule.");
                  onChanged();
                }
              }}
            >
              Make default
            </Button>
          )}
          {!sel.isDefault && (
            <ConfirmDialog
              trigger={(open) => (
                <Button variant="ghost" size="sm" onClick={open} aria-label="Delete schedule">
                  <Trash2 className="size-4" /> Delete
                </Button>
              )}
              title={`Delete “${sel.name}”?`}
              message={usedBy ? `${usedBy} class/weekday setting(s) use it. Reassign those first.` : "Its periods are removed. Classes using it must be reassigned first."}
              confirmLabel="Delete"
              onConfirm={async () => {
                const r = await deleteSchedule(sel.id);
                if (!r.ok) return void toast.error(r.error);
                toast.success("Schedule deleted.");
                router.push("/timetable/bell-schedule");
                router.refresh();
              }}
            />
          )}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[34rem] text-left text-sm">
          <thead className="bg-cream-100 text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Starts</th>
              <th className="px-3 py-2">Ends</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {[...rows]
              .sort((a, b) => a.start.localeCompare(b.start))
              .map((r) => (
                <tr key={r.key} className="border-t border-border">
                  <td className="px-3 py-1.5">
                    <Select aria-label="Type" value={r.kind} onChange={(e) => set(r.key, { kind: e.target.value as Row["kind"] })} className="min-w-44">
                      <option value="teaching">Teaching period</option>
                      <option value="break">Short break</option>
                      <option value="lunch">Lunch</option>
                    </Select>
                  </td>
                  <td className="px-3 py-1.5">
                    {r.kind === "teaching" ? (
                      <span className="font-medium text-navy-900">Period {noOf.get(r.key)}</span>
                    ) : (
                      <Input aria-label="Name" value={r.label} onChange={(e) => set(r.key, { label: e.target.value })} className="w-40" />
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    <Input type="time" aria-label="Starts" value={r.start} onChange={(e) => set(r.key, { start: e.target.value })} className="w-32" />
                  </td>
                  <td className="px-3 py-1.5">
                    <Input type="time" aria-label="Ends" value={r.end} onChange={(e) => set(r.key, { end: e.target.value })} className="w-32" />
                  </td>
                  <td className="px-3 py-1.5 text-right">
                    <Button variant="ghost" size="sm" aria-label="Remove this row" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))}>
                      <Trash2 className="size-4" /> Remove
                    </Button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => add("teaching")}>
          <Plus className="size-4" /> Add period
        </Button>
        <Button variant="secondary" size="sm" onClick={() => add("break")}>
          <Plus className="size-4" /> Add break
        </Button>
        <Button variant="secondary" size="sm" onClick={() => add("lunch")}>
          <Plus className="size-4" /> Add lunch
        </Button>
        <Button className="ml-auto" loading={busy} onClick={save}>
          Save schedule
        </Button>
      </div>
      <p className="text-xs text-muted">Periods are numbered 1, 2, 3… in time order. Existing timetable entries keep their period numbers, so check the class timetables after adding or removing a period.</p>
    </Card>
  );
}
