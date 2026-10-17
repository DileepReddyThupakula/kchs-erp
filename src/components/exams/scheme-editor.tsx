"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Lock, Pencil, Plus, Trash2, Wand2 } from "lucide-react";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/form";
import { applyDefaultScheme, deleteComponent, deleteGroup, saveComponent, saveGroup, setClassMode, setPassMark, setSubjectMax } from "@/features/exams/actions";
import { describeGroup, fmtNum, KIND_LABEL, METHOD_LABEL, MODE_LABEL, type GroupLite, type MemberLite, type Mode } from "@/features/exams/shared";

type Comp = { id: string; name: string; max_marks: number; sort_order: number; locked_at: string | null };
type Grp = GroupLite & { start_date: string | null; end_date: string | null; sort_order: number; locked_at: string | null };
type Subj = { id: string; name: string };

export function SchemeEditor({
  yearId,
  classId,
  className,
  mode,
  components,
  groups,
  members,
  subjectMax,
  subjects,
  passMarks,
  defaultPass,
}: {
  yearId: string;
  classId: string;
  className: string;
  mode: Mode;
  components: Comp[];
  groups: Grp[];
  members: MemberLite[];
  subjectMax: { component_id: string; subject_id: string; max_marks: number }[];
  subjects: Subj[];
  passMarks: Record<string, number>;
  defaultPass: number;
  yearStart: string;
  yearEnd: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [comp, setComp] = useState<{ id?: string; name: string; max: string } | null>(null);
  const [grp, setGrp] = useState<GroupDraft | null>(null);
  const [ov, setOv] = useState<{ comp: Comp; subject: string; max: string } | null>(null);
  const [pass, setPass] = useState<Record<string, string>>(Object.fromEntries(subjects.map((s) => [s.id, passMarks[s.id] != null ? String(passMarks[s.id]) : ""])));

  async function run(p: Promise<{ ok: boolean; message?: string; error?: string }>) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    toast.success(r.message ?? "Saved.");
    router.refresh();
    return true;
  }
  const compMap = new Map(components.map((c) => [c.id, { id: c.id, name: c.name, max_marks: c.max_marks }]));
  const grpMap = new Map<string, GroupLite>(groups.map((g) => [g.id, g]));
  const empty = components.length === 0 && groups.length === 0;
  const anyLocked = components.some((c) => c.locked_at) || groups.some((g) => g.locked_at);

  return (
    <div className="space-y-4">
      <Card className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-semibold text-navy-900">{className}</h2>
          <label className="flex items-center gap-2 text-sm">
            Results are
            <Select aria-label="Class mode" className="w-auto" value={mode} disabled={busy || anyLocked} onChange={(e) => run(setClassMode(yearId, classId, e.target.value as Mode))}>
              {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
                <option key={m} value={m}>
                  {MODE_LABEL[m]}
                </option>
              ))}
            </Select>
          </label>
          {anyLocked && (
            <Badge tone="warning">
              <Lock className="size-3" /> Part of this class is locked: unlock it on the Locks tab to change the scheme.
            </Badge>
          )}
          <span className="flex-1" />
          {empty && (
            <Button loading={busy} onClick={() => run(applyDefaultScheme(yearId, classId))}>
              <Wand2 className="size-4" /> Apply the starting scheme
            </Button>
          )}
        </div>
        {empty && <p className="text-sm text-muted">This class has no exams yet. The starting scheme (to be checked, VERIFY): FA1–FA4 out of 20 and SA1, SA2 out of 80; each term = the FA average scaled to 20 + SA = 100; final = both terms = 200. You can change everything afterwards.</p>}
        {mode !== "marks" && !empty && <p className="text-sm text-muted">This class uses {MODE_LABEL[mode].toLowerCase()}: only the terms are used (for the dates, grades and remarks). Exams and marks are not used.</p>}
      </Card>

      {mode === "marks" && (
        <Card className="space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-navy-900">Exams</h3>
            <span className="text-sm text-muted">Each has a maximum. A subject can have its own maximum.</span>
            <span className="flex-1" />
            <Button size="sm" onClick={() => setComp({ name: "", max: "" })}>
              <Plus className="size-4" /> Add an exam
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th className="py-1 pr-3">Name</th>
                  <th className="py-1 pr-3">Maximum</th>
                  <th className="py-1 pr-3">Different for</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {components.map((c) => (
                  <tr key={c.id}>
                    <td className="py-1.5 pr-3 font-medium">
                      {c.name} {c.locked_at && <Lock className="inline size-3.5 text-amber-700" aria-label="locked" />}
                    </td>
                    <td className="py-1.5 pr-3 tabular-nums">{fmtNum(c.max_marks)}</td>
                    <td className="py-1.5 pr-3 text-xs text-muted">
                      {subjectMax
                        .filter((o) => o.component_id === c.id)
                        .map((o) => `${subjects.find((s) => s.id === o.subject_id)?.name ?? "?"}: ${fmtNum(o.max_marks)}`)
                        .join(", ") || "—"}
                    </td>
                    <td className="py-1.5 text-right">
                      <Button variant="ghost" size="sm" disabled={!!c.locked_at} onClick={() => setComp({ id: c.id, name: c.name, max: String(c.max_marks) })}>
                        <Pencil className="size-4" /> Edit
                      </Button>
                      <Button variant="ghost" size="sm" disabled={!!c.locked_at} onClick={() => setOv({ comp: c, subject: subjects[0]?.id ?? "", max: "" })}>
                        Subject maximum
                      </Button>
                      <Button variant="ghost" size="sm" disabled={!!c.locked_at || busy} onClick={() => confirm(`Delete ${c.name}? This is only possible when it is not used and has no marks.`) && run(deleteComponent(c.id))}>
                        <Trash2 className="size-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
                {!components.length && (
                  <tr>
                    <td colSpan={4} className="py-3 text-center text-muted">
                      No exams yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Card className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-navy-900">Terms and the final result</h3>
          <span className="text-sm text-muted">How the exams combine. The line under each shows the rule in words; check it.</span>
          <span className="flex-1" />
          <Button size="sm" onClick={() => setGrp({ name: "", kind: mode === "marks" ? "part" : "term", method: "sum", bestN: "1", scaleTo: "", start: "", end: "", members: [] })}>
            <Plus className="size-4" /> Add a result
          </Button>
        </div>
        <ul className="space-y-2">
          {groups.map((g) => (
            <li key={g.id} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-navy-900">{g.name}</span>
                <Badge tone={g.kind === "final" ? "gold" : g.kind === "term" ? "info" : "neutral"}>{KIND_LABEL[g.kind]}</Badge>
                {g.locked_at && (
                  <Badge tone="warning">
                    <Lock className="size-3" /> Locked
                  </Badge>
                )}
                {(g.start_date || g.end_date) && (
                  <span className="text-xs text-muted">
                    {g.start_date} to {g.end_date}
                  </span>
                )}
                <span className="flex-1" />
                <Button variant="ghost" size="sm" disabled={!!g.locked_at} onClick={() => setGrp(draftOf(g, members))}>
                  <Pencil className="size-4" /> Edit
                </Button>
                <Button variant="ghost" size="sm" disabled={!!g.locked_at || busy} onClick={() => confirm(`Delete ${g.name}?`) && run(deleteGroup(g.id))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <p className="mt-1 text-sm text-foreground">{describeGroup(g, members, compMap, grpMap)}</p>
            </li>
          ))}
          {!groups.length && <li className="text-sm text-muted">No results yet.</li>}
        </ul>
        <p className="text-xs text-muted">Term dates decide the attendance shown on that term&apos;s report card. Enter the real dates. Add every school vacation and break to the holiday list (School setup → Academic years &amp; holidays), otherwise the working days on the report card will be too high.</p>
      </Card>

      {mode === "marks" && (
        <Card className="space-y-2">
          <h3 className="font-semibold text-navy-900">Pass marks</h3>
          <p className="text-sm text-muted">A subject passes when its percentage is at least the pass mark. Empty = the school default ({fmtNum(defaultPass)}%). Hindi, for example, can be set differently.</p>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {subjects.map((s) => (
              <div key={s.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-1.5">
                <span className="flex-1 text-sm font-medium">{s.name}</span>
                <Input aria-label={`Pass mark for ${s.name}`} className="h-8 w-20 tabular-nums" inputMode="decimal" placeholder={String(defaultPass)} value={pass[s.id] ?? ""} onChange={(e) => setPass((p) => ({ ...p, [s.id]: e.target.value }))} />
                <span className="text-sm">%</span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy || (pass[s.id] ?? "") === (passMarks[s.id] != null ? String(passMarks[s.id]) : "")}
                  onClick={() => run(setPassMark(yearId, classId, s.id, (pass[s.id] ?? "") === "" ? null : Number(pass[s.id])))}
                >
                  Save
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {comp && (
        <Modal
          open
          onClose={() => setComp(null)}
          title={comp.id ? "Edit exam" : "Add an exam"}
          footer={
            <>
              <Button variant="secondary" onClick={() => setComp(null)}>
                Cancel
              </Button>
              <Button
                loading={busy}
                onClick={async () => {
                  if (await run(saveComponent({ id: comp.id, yearId, classId, name: comp.name, maxMarks: Number(comp.max), sortOrder: comp.id ? components.find((c) => c.id === comp.id)?.sort_order : components.length + 1 }))) setComp(null);
                }}
              >
                Save
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-foreground">
            <Field label="Name" name="c-name" hint="For example FA1, SA1, Unit test, Half-yearly.">
              <Input id="c-name" value={comp.name} onChange={(e) => setComp({ ...comp, name: e.target.value })} />
            </Field>
            <Field label="Maximum marks" name="c-max">
              <Input id="c-max" inputMode="decimal" value={comp.max} onChange={(e) => setComp({ ...comp, max: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
      {ov && (
        <Modal
          open
          onClose={() => setOv(null)}
          title={`${ov.comp.name}: a different maximum for one subject`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setOv(null)}>
                Cancel
              </Button>
              <Button variant="secondary" loading={busy} onClick={async () => (await run(setSubjectMax(ov.comp.id, ov.subject, null))) && setOv(null)}>
                Use the exam&apos;s maximum
              </Button>
              <Button
                loading={busy}
                disabled={!ov.max}
                onClick={async () => {
                  if (await run(setSubjectMax(ov.comp.id, ov.subject, Number(ov.max)))) setOv(null);
                }}
              >
                Save
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-foreground">
            <Field label="Subject" name="o-sub">
              <Select id="o-sub" value={ov.subject} onChange={(e) => setOv({ ...ov, subject: e.target.value })}>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={`Maximum for this subject (the exam's is ${fmtNum(ov.comp.max_marks)})`} name="o-max">
              <Input id="o-max" inputMode="decimal" value={ov.max} onChange={(e) => setOv({ ...ov, max: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
      {grp && (
        <GroupModal
          draft={grp}
          onClose={() => setGrp(null)}
          busy={busy}
          comps={components}
          others={groups.filter((g) => g.id !== grp.id)}
          onSave={async (d) => {
            const ok = await run(
              saveGroup({
                id: d.id,
                yearId,
                classId,
                name: d.name,
                kind: d.kind,
                method: d.method,
                bestN: d.method === "best_n" ? Number(d.bestN) : null,
                scaleTo: d.scaleTo ? Number(d.scaleTo) : null,
                startDate: d.start || null,
                endDate: d.end || null,
                sortOrder: d.id ? groups.find((g) => g.id === d.id)?.sort_order : groups.length + 1,
                members: d.members.map((m) => ({ componentId: m.type === "c" ? m.ref : undefined, childGroupId: m.type === "g" ? m.ref : undefined, scaleTo: m.scale ? Number(m.scale) : null })),
              }),
            );
            if (ok) setGrp(null);
          }}
        />
      )}
    </div>
  );
}

type DraftMember = { type: "c" | "g"; ref: string; scale: string };
type GroupDraft = { id?: string; name: string; kind: "part" | "term" | "final"; method: "sum" | "average" | "best_n"; bestN: string; scaleTo: string; start: string; end: string; members: DraftMember[] };
function draftOf(g: Grp, members: MemberLite[]): GroupDraft {
  return {
    id: g.id,
    name: g.name,
    kind: g.kind,
    method: g.method,
    bestN: String(g.best_n ?? 1),
    scaleTo: g.scale_to != null ? String(g.scale_to) : "",
    start: g.start_date ?? "",
    end: g.end_date ?? "",
    members: members
      .filter((m) => m.group_id === g.id)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((m) => ({ type: m.component_id ? "c" : "g", ref: (m.component_id ?? m.child_group_id)!, scale: m.scale_to != null ? String(m.scale_to) : "" })),
  };
}

function GroupModal({ draft, onClose, onSave, busy, comps, others }: { draft: GroupDraft; onClose: () => void; onSave: (d: GroupDraft) => void; busy: boolean; comps: Comp[]; others: Grp[] }) {
  const [d, setD] = useState(draft);
  const has = (t: "c" | "g", id: string) => d.members.some((m) => m.type === t && m.ref === id);
  const label = (m: DraftMember) => (m.type === "c" ? comps.find((c) => c.id === m.ref)?.name : others.find((g) => g.id === m.ref)?.name) ?? "?";
  const move = (i: number, by: number) =>
    setD((x) => {
      const a = [...x.members];
      const j = i + by;
      if (j < 0 || j >= a.length) return x;
      [a[i], a[j]] = [a[j], a[i]];
      return { ...x, members: a };
    });
  return (
    <Modal
      open
      onClose={onClose}
      title={d.id ? `Edit ${d.name}` : "Add a result"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={() => onSave(d)}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-foreground">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" name="g-name">
            <Input id="g-name" value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
          </Field>
          <Field label="Kind" name="g-kind" hint="A term gets a report card; the final is shown after Term 2.">
            <Select id="g-kind" value={d.kind} onChange={(e) => setD({ ...d, kind: e.target.value as GroupDraft["kind"] })}>
              {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="How it combines" name="g-method">
            <Select id="g-method" value={d.method} onChange={(e) => setD({ ...d, method: e.target.value as GroupDraft["method"] })}>
              {(Object.keys(METHOD_LABEL) as (keyof typeof METHOD_LABEL)[]).map((k) => (
                <option key={k} value={k}>
                  {METHOD_LABEL[k]}
                </option>
              ))}
            </Select>
          </Field>
          {d.method === "best_n" ? (
            <Field label="How many (best N)" name="g-n">
              <Input id="g-n" inputMode="numeric" value={d.bestN} onChange={(e) => setD({ ...d, bestN: e.target.value })} />
            </Field>
          ) : (
            <span />
          )}
          <Field label="Scale the result to (optional)" name="g-scale" hint="For example 20 to turn the average of FA1 and FA2 into marks out of 20.">
            <Input id="g-scale" inputMode="decimal" value={d.scaleTo} onChange={(e) => setD({ ...d, scaleTo: e.target.value })} />
          </Field>
          {d.kind === "term" && (
            <>
              <Field label="Term starts" name="g-start">
                <Input id="g-start" type="date" value={d.start} onChange={(e) => setD({ ...d, start: e.target.value })} />
              </Field>
              <Field label="Term ends" name="g-end">
                <Input id="g-end" type="date" value={d.end} onChange={(e) => setD({ ...d, end: e.target.value })} />
              </Field>
            </>
          )}
        </div>
        <div>
          <p className="mb-1 text-sm font-medium">Made of (in this order)</p>
          <ul className="space-y-1">
            {d.members.map((m, i) => (
              <li key={`${m.type}${m.ref}`} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1 text-sm">
                <span className="flex-1">
                  {label(m)} <span className="text-xs text-muted">{m.type === "g" ? "(a result)" : "(an exam)"}</span>
                </span>
                <label className="flex items-center gap-1 text-xs">
                  scale to
                  <Input aria-label={`Scale ${label(m)} to`} className="h-7 w-16" inputMode="decimal" value={m.scale} onChange={(e) => setD((x) => ({ ...x, members: x.members.map((y, j) => (j === i ? { ...y, scale: e.target.value } : y)) }))} />
                </label>
                <Button variant="ghost" size="sm" aria-label="Move up" onClick={() => move(i, -1)}>
                  <ArrowUp className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" aria-label="Move down" onClick={() => move(i, 1)}>
                  <ArrowDown className="size-4" />
                </Button>
                <Button variant="ghost" size="sm" aria-label="Remove" onClick={() => setD((x) => ({ ...x, members: x.members.filter((_, j) => j !== i) }))}>
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
            {!d.members.length && <li className="text-sm text-muted">Nothing added yet.</li>}
          </ul>
          <p className="mb-1 mt-2 text-xs font-medium uppercase tracking-wide text-muted">Add</p>
          <div className="flex flex-wrap gap-1.5">
            {comps.filter((c) => !has("c", c.id)).map((c) => (
              <button key={c.id} type="button" onClick={() => setD((x) => ({ ...x, members: [...x.members, { type: "c", ref: c.id, scale: "" }] }))} className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-sm hover:bg-navy-50">
                + {c.name}
              </button>
            ))}
            {others.filter((g) => !has("g", g.id)).map((g) => (
              <button key={g.id} type="button" onClick={() => setD((x) => ({ ...x, members: [...x.members, { type: "g", ref: g.id, scale: "" }] }))} className="rounded-full border border-gold-300 bg-gold-50 px-2.5 py-0.5 text-sm hover:bg-gold-100">
                + {g.name}
              </button>
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}
