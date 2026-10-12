"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, UserPlus, XCircle } from "lucide-react";
import { DataTable, type Column, type RowAction } from "@/components/data-table/data-table";
import { Drawer, Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, StatusChip } from "@/components/ui/card";
import { ActionForm, FormSection } from "@/components/ui/action-form";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { useDrawer } from "@/components/ui/use-drawer";
import { StudentPicker, type PickerStudent } from "@/components/fees/student-picker";
import { formatDate } from "@/lib/utils";
import { formatPaise, rupeesInput } from "@/lib/money";
import { addSpecialFeeStudents, cancelSpecialFee, createSpecialFee, updateSpecialFee } from "@/features/fees/actions";

export type CampaignRow = {
  id: string;
  name: string;
  description: string | null;
  amountMode: "flat" | "per_class";
  amount: number | null;
  classAmounts: Record<string, number>;
  audience: "all" | "classes" | "sections" | "students";
  audienceIds: string[];
  applyConcessions: boolean;
  status: "active" | "cancelled";
  cancelReason: string | null;
  students: number;
  total: number;
  paid: number;
  installments: { label: string; dueDate: string; shareBp: number | null }[];
  createdAt: string;
};
type Opt = { id: string; name: string };

const AUDIENCE_LABEL = { all: "All active students", classes: "Selected classes", sections: "Selected sections", students: "Chosen students" } as const;

function Progress({ paid, total }: { paid: number; total: number }) {
  const pct = total ? Math.min(100, Math.round((paid / total) * 100)) : 0;
  return (
    <div className="min-w-40">
      <div className="mb-1 flex justify-between text-xs tabular-nums">
        <span className="font-medium text-navy-900">{formatPaise(paid)}</span>
        <span className="text-muted">of {formatPaise(total)}</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-cream-200" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gradient-to-r from-gold-500 to-peacock-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Create form fields (state lives here so the drawer form stays simple). */
function CreateFields({ yearId, classes, sections, students, errors }: { yearId: string; classes: Opt[]; sections: { id: string; label: string }[]; students: PickerStudent[]; errors: Record<string, string[] | undefined> }) {
  const [mode, setMode] = useState<"flat" | "per_class">("flat");
  const [plan, setPlan] = useState<"one_time" | "custom">("one_time");
  const [audience, setAudience] = useState<"all" | "classes" | "sections" | "students">("all");
  const [ids, setIds] = useState<string[]>([]);
  const [inst, setInst] = useState([
    { label: "Part 1", due_date: "", pct: "50" },
    { label: "Part 2", due_date: "", pct: "50" },
  ]);
  const sum = inst.reduce((a, r) => a + (Number(r.pct) || 0), 0);
  const instJson = JSON.stringify(inst.map((r) => ({ label: r.label, due_date: r.due_date, share_bp: Math.round((Number(r.pct) || 0) * 100) })));
  const toggle = (id: string) => setIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const chosenClassIds = audience === "classes" ? ids : null;
  const visibleClasses = mode === "per_class" && chosenClassIds ? classes.filter((c) => chosenClassIds.includes(c.id)) : classes;

  return (
    <>
      <input type="hidden" name="year_id" value={yearId} />
      <input type="hidden" name="audience_ids" value={JSON.stringify(ids)} />
      <input type="hidden" name="installments" value={instJson} />
      <FormSection title="Special fee">
        <Field label="Name" name="name" errors={errors.name} className="sm:col-span-2" hint="e.g. Annual day, Science trip, Uniform">
          <Input id="name" name="name" required />
        </Field>
        <Field label="Description" name="description" className="sm:col-span-2">
          <Textarea id="description" name="description" rows={2} />
        </Field>
      </FormSection>

      <FormSection title="Amount">
        <Field label="Amount for" name="amount_mode">
          <Select id="amount_mode" name="amount_mode" value={mode} onChange={(e) => setMode(e.target.value as "flat" | "per_class")}>
            <option value="flat">Everyone pays the same</option>
            <option value="per_class">A different amount per class</option>
          </Select>
        </Field>
        {mode === "flat" ? (
          <Field label="Amount (₹)" name="amount" errors={errors.amount}>
            <Input id="amount" name="amount" inputMode="decimal" />
          </Field>
        ) : (
          <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
            {visibleClasses.map((c) => (
              <Field key={c.id} label={`${c.name} (₹)`} name={`class_amount.${c.id}`} errors={errors[`class_amount.${c.id}`]}>
                <Input id={`class_amount.${c.id}`} name={`class_amount.${c.id}`} inputMode="decimal" />
              </Field>
            ))}
            {audience === "classes" && ids.length === 0 && <p className="text-xs text-muted sm:col-span-2">Choose the classes below to see them here.</p>}
          </div>
        )}
      </FormSection>

      <FormSection title="Payment">
        <Field label="Paid as" name="plan_mode">
          <Select id="plan_mode" name="plan_mode" value={plan} onChange={(e) => setPlan(e.target.value as "one_time" | "custom")}>
            <option value="one_time">One payment</option>
            <option value="custom">Custom installments</option>
          </Select>
        </Field>
        {plan === "one_time" ? (
          <Field label="Due date" name="due_date" errors={errors.due_date}>
            <Input id="due_date" name="due_date" type="date" required />
          </Field>
        ) : (
          <div className="space-y-2 sm:col-span-2">
            {inst.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_9rem_5rem_2rem] items-center gap-2">
                <input aria-label="Installment name" className="h-10 rounded-lg border border-border bg-surface px-3 text-sm" value={r.label} onChange={(e) => setInst((x) => x.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
                <input aria-label="Due date" type="date" className="h-10 rounded-lg border border-border bg-surface px-2 text-sm" value={r.due_date} onChange={(e) => setInst((x) => x.map((y, j) => (j === i ? { ...y, due_date: e.target.value } : y)))} />
                <input aria-label="Share percent" inputMode="decimal" className="h-10 rounded-lg border border-border bg-surface px-2 text-sm" value={r.pct} onChange={(e) => setInst((x) => x.map((y, j) => (j === i ? { ...y, pct: e.target.value } : y)))} />
                <button type="button" aria-label="Remove installment" className="grid size-8 place-items-center rounded-lg text-red-700 hover:bg-red-50" onClick={() => setInst((x) => x.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button type="button" size="sm" variant="secondary" onClick={() => setInst((x) => [...x, { label: `Part ${x.length + 1}`, due_date: "", pct: "" }])}>
                <Plus className="size-3.5" /> Add installment
              </Button>
              <span className={sum === 100 ? "text-xs text-peacock-700" : "text-xs text-red-700"}>Total {sum}% {sum === 100 ? "✓" : "(must be 100%)"}</span>
            </div>
            {errors.installments?.map((e) => (
              <p key={e} className="text-xs text-danger">{e}</p>
            ))}
          </div>
        )}
      </FormSection>

      <FormSection title="Who pays" columns={1}>
        <Field label="Students" name="audience" errors={errors.audience}>
          <Select
            id="audience"
            name="audience"
            value={audience}
            onChange={(e) => {
              setAudience(e.target.value as typeof audience);
              setIds([]);
            }}
          >
            {Object.entries(AUDIENCE_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        {audience === "classes" && (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {classes.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={ids.includes(c.id)} onChange={() => toggle(c.id)} className="accent-navy-700" /> {c.name}
              </label>
            ))}
          </div>
        )}
        {audience === "sections" && (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {sections.map((s) => (
              <label key={s.id} className="flex items-center gap-1.5 text-sm">
                <input type="checkbox" checked={ids.includes(s.id)} onChange={() => toggle(s.id)} className="accent-navy-700" /> {s.label}
              </label>
            ))}
          </div>
        )}
        {audience === "students" && <StudentPicker students={students} value={ids} onChange={setIds} multiple />}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" name="apply_concessions" className="mt-1 accent-navy-700" />
          <span>
            Apply students&apos; existing concessions to this fee
            <span className="block text-xs text-muted">Off by default. A concession that names this special fee (Concessions page) always applies.</span>
          </span>
        </label>
      </FormSection>
    </>
  );
}

export function SpecialTab({ yearId, yearName, rows, classes, sections, students }: { yearId: string; yearName: string; rows: CampaignRow[]; classes: Opt[]; sections: { id: string; label: string }[]; students: PickerStudent[] }) {
  const router = useRouter();
  const drawer = useDrawer<CampaignRow>();
  const [adding, setAdding] = useState<CampaignRow | null>(null);
  const [addIds, setAddIds] = useState<string[]>([]);
  const [cancelling, setCancelling] = useState<CampaignRow | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const className = useMemo(() => new Map(classes.map((c) => [c.id, c.name])), [classes]);
  const sectionLabel = useMemo(() => new Map(sections.map((s) => [s.id, s.label])), [sections]);

  const columns: Column<CampaignRow>[] = [
    {
      id: "name",
      header: "Special fee",
      hideable: false,
      pinned: "left",
      className: "whitespace-nowrap",
      cell: (r) => (
        <span className="font-medium text-navy-900">
          {r.name} {r.status === "cancelled" && <StatusChip status="left" label="Cancelled" />}
        </span>
      ),
      sortValue: (r) => r.name,
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      className: "whitespace-nowrap",
      cell: (r) => (r.amountMode === "flat" ? formatPaise(r.amount) : <span className="text-muted">Per class</span>),
      sortValue: (r) => r.amount ?? 0,
      exportValue: (r) => (r.amount ?? 0) / 100,
    },
    {
      id: "due",
      header: "Due",
      className: "whitespace-nowrap",
      cell: (r) => (r.installments.length > 1 ? `${r.installments.length} installments` : formatDate(r.installments[0]?.dueDate)),
      sortValue: (r) => r.installments[0]?.dueDate ?? "",
    },
    { id: "who", header: "Who pays", cell: (r) => <Badge tone="info">{AUDIENCE_LABEL[r.audience]}</Badge>, sortValue: (r) => r.audience, exportValue: (r) => AUDIENCE_LABEL[r.audience] },
    { id: "students", header: "Students", align: "right", cell: (r) => r.students, sortValue: (r) => r.students },
    { id: "progress", header: "Collected / total", cell: (r) => <Progress paid={r.paid} total={r.total} />, sortValue: (r) => r.paid, exportValue: (r) => `${r.paid / 100} of ${r.total / 100}` },
    { id: "created", header: "Created", className: "whitespace-nowrap", cell: (r) => formatDate(r.createdAt.slice(0, 10)), sortValue: (r) => r.createdAt, defaultHidden: true },
  ];
  const actions = (r: CampaignRow): RowAction[] => [
    { id: "view", kind: "view", label: "View", onClick: () => drawer.openView(r) },
    ...(r.status === "active"
      ? ([
          { id: "edit", kind: "edit", label: "Edit", onClick: () => drawer.openEdit(r) },
          { id: "add", kind: "menu", label: "Add students", icon: UserPlus, onClick: () => { setAddIds([]); setAdding(r); } },
          { id: "cancel", kind: "menu", label: "Cancel special fee", icon: XCircle, tone: "danger", onClick: () => { setReason(""); setCancelling(r); } },
        ] satisfies RowAction[])
      : []),
  ];

  const cur = drawer.item;
  const audienceText = (r: CampaignRow) =>
    r.audience === "all"
      ? "All active students"
      : r.audience === "classes"
        ? r.audienceIds.map((i) => className.get(i)).filter(Boolean).join(", ")
        : r.audience === "sections"
          ? r.audienceIds.map((i) => sectionLabel.get(i)).filter(Boolean).join(", ")
          : `${r.students} chosen student(s)`;

  return (
    <>
      <DataTable
        id="special-fees"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        searchText={(r) => `${r.name} ${r.description ?? ""}`}
        filters={[{ id: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "cancelled", label: "Cancelled" }], match: (r, v) => r.status === v }]}
        initialFilters={{ status: "active" }}
        rowActions={actions}
        onRowClick={(r) => drawer.openView(r)}
        rowLabel={(r) => r.name}
        exportName={`special-fees-${yearName}`}
        emptyTitle="No special fees yet"
        emptyMessage="Create one for an annual day, trip, uniform or any one-off charge. Its dues appear in Collect fee, Dues and Receipts like any other fee."
        toolbar={
          <Button onClick={drawer.openNew}>
            <Plus className="size-4" /> Add special fee
          </Button>
        }
      />

      {/* create / edit / view */}
      <Drawer open={drawer.open} onClose={drawer.close} wide title={cur ? `${drawer.readOnly ? "" : "Edit "}${cur.name}` : "Add special fee"} description={cur ? `${AUDIENCE_LABEL[cur.audience]} · ${cur.students} student(s)` : `Academic year ${yearName}`}>
        {!cur ? (
          <ActionForm action={createSpecialFee} layout="drawer" submitLabel="Create special fee" onCancel={drawer.close} onSuccess={drawer.close}>
            {(fe) => <CreateFields yearId={yearId} classes={classes} sections={sections} students={students} errors={fe} />}
          </ActionForm>
        ) : (
          <ActionForm key={`${cur.id}-${drawer.mode}`} action={updateSpecialFee} layout="drawer" submitLabel="Save changes" onCancel={drawer.close} onSuccess={drawer.close} readOnly={drawer.readOnly || cur.status !== "active"} onEditRequest={cur.status === "active" ? drawer.toEdit : undefined}>
            {(fe) => (
              <>
                <input type="hidden" name="id" value={cur.id} />
                <input type="hidden" name="amount_mode" value={cur.amountMode} />
                <FormSection title="Details">
                  <Field label="Description" name="description" className="sm:col-span-2">
                    <Textarea id="description" name="description" rows={2} defaultValue={cur.description ?? ""} />
                  </Field>
                  <Field label="Who pays" name="who-show" className="sm:col-span-2">
                    <Input id="who-show" disabled readOnly value={audienceText(cur) || "—"} />
                  </Field>
                </FormSection>
                <FormSection title="Amount" description={!drawer.readOnly ? "Changing amounts or the due date updates unpaid dues only. Part-paid and paid dues stay as they are." : undefined}>
                  {cur.amountMode === "flat" ? (
                    <Field label="Amount (₹)" name="amount" errors={fe.amount}>
                      <Input id="amount" name="amount" inputMode="decimal" defaultValue={rupeesInput(cur.amount)} />
                    </Field>
                  ) : (
                    classes
                      .filter((c) => c.id in cur.classAmounts)
                      .map((c) => (
                        <Field key={c.id} label={`${c.name} (₹)`} name={`class_amount.${c.id}`} errors={fe[`class_amount.${c.id}`]}>
                          <Input id={`class_amount.${c.id}`} name={`class_amount.${c.id}`} inputMode="decimal" defaultValue={rupeesInput(cur.classAmounts[c.id])} />
                        </Field>
                      ))
                  )}
                  {cur.installments.length === 1 ? (
                    <Field label="Due date" name="due_date" errors={fe.due_date}>
                      <Input id="due_date" name="due_date" type="date" defaultValue={cur.installments[0].dueDate} />
                    </Field>
                  ) : (
                    <div className="text-sm sm:col-span-2">
                      <p className="mb-1 font-medium">Installments</p>
                      <ul className="space-y-0.5 text-muted">
                        {cur.installments.map((i) => (
                          <li key={i.label}>
                            {i.label}: {formatDate(i.dueDate)} · {i.shareBp != null ? `${i.shareBp / 100}%` : ""}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </FormSection>
                <FormSection title="Concessions" columns={1}>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="apply_concessions" defaultChecked={cur.applyConcessions} className="accent-navy-700" /> Apply students&apos; existing concessions to this fee
                  </label>
                </FormSection>
                <FormSection title="Collection" columns={1}>
                  <Progress paid={cur.paid} total={cur.total} />
                  {cur.status === "cancelled" && <p className="text-sm text-red-700">Cancelled: {cur.cancelReason}</p>}
                </FormSection>
              </>
            )}
          </ActionForm>
        )}
      </Drawer>

      {/* add students (late joiners) */}
      <Modal
        open={!!adding}
        onClose={() => !busy && setAdding(null)}
        title={`Add students to “${adding?.name ?? ""}”`}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setAdding(null)}>
              Cancel
            </Button>
            <Button
              loading={busy}
              disabled={!addIds.length}
              onClick={async () => {
                if (!adding) return;
                setBusy(true);
                const res = await addSpecialFeeStudents(adding.id, addIds);
                setBusy(false);
                if (res.error) return toast.error(res.error);
                toast.success(res.message);
                setAdding(null);
                router.refresh();
              }}
            >
              Add {addIds.length || ""} student{addIds.length === 1 ? "" : "s"}
            </Button>
          </>
        }
      >
        <p className="mb-3">Dues are generated at the fee&apos;s current amount. Students already included are skipped.</p>
        <StudentPicker students={students} value={addIds} onChange={setAddIds} multiple />
      </Modal>

      {/* cancel with reason */}
      <Modal
        open={!!cancelling}
        onClose={() => !busy && setCancelling(null)}
        title={`Cancel “${cancelling?.name ?? ""}”?`}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setCancelling(null)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={reason.trim().length < 3}
              onClick={async () => {
                if (!cancelling) return;
                setBusy(true);
                const res = await cancelSpecialFee(cancelling.id, reason);
                setBusy(false);
                if (res.error) return toast.error(res.error);
                toast.success(res.message);
                setCancelling(null);
                router.refresh();
              }}
            >
              Cancel special fee
            </Button>
          </>
        }
      >
        <p className="mb-3">Unpaid dues are removed. Dues already paid or part-paid, and their receipts, stay untouched.</p>
        <Field label="Reason" name="cancel-reason">
          <Input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Trip called off" />
        </Field>
      </Modal>
    </>
  );
}
