"use client";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Checklist, TotalsTable, WhatConfirmDoes } from "@/components/promotion/parts";
import { StudentTable } from "@/components/promotion/student-table";
import { ConfirmBox } from "@/components/promotion/confirm-box";
import { confirmRollover, previewRollover } from "@/features/promotion/actions";
import { buildPlan, DEFAULT_MAX_SIZE, emptyEdits, sectionKey, setMany, setSection, setStudent, type Edits, type Preview } from "@/features/promotion/shared";

const field = "h-9 rounded-lg border border-border bg-surface px-2.5 text-sm shadow-sm";

/** The preview page. Every change asks the database for a fresh preview; nothing is applied until Confirm. */
export function PromotionClient({ initial, mediums, staff }: { initial: Preview; mediums: string[]; staff: { id: string; name: string }[] }) {
  const router = useRouter();
  const [preview, setPreview] = useState(initial);
  const [edits, setEdits] = useState<Edits>(emptyEdits());
  const [loading, setLoading] = useState(false);
  const [busy, startConfirm] = useTransition();
  const seq = useRef(0);
  const first = useRef(true);
  const fromId = preview.from_year.id;
  const toId = preview.to_year.id;

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const mine = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      const res = await previewRollover(fromId, toId, buildPlan(edits));
      if (mine !== seq.current) return;
      setLoading(false);
      if (res.ok) setPreview(res.preview); else toast.error(res.error);
    }, 350);
    return () => clearTimeout(t);
  }, [edits, fromId, toId]);

  const confirm = useCallback((checked: boolean, typed: string) => {
    startConfirm(async () => {
      const res = await confirmRollover(fromId, toId, buildPlan(edits), checked, typed);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(res.message);
      router.refresh();
    });
  }, [edits, fromId, toId, router]);

  const newSections = preview.sections.filter((s) => !s.exists && s.count > 0);
  return (
    <div aria-busy={loading}>
      <WhatConfirmDoes from={preview.from_year.name} to={preview.to_year.name} />
      <Card className="mb-4">
        <h2 className="mb-2 font-semibold text-navy-900">Settings</h2>
        <div className="flex flex-wrap items-end gap-4 text-sm">
          <label className="text-xs text-muted">Most students in one section
            <input type="number" min={1} max={500} value={edits.max_size} onChange={(e) => setEdits({ ...edits, max_size: Math.max(1, Number(e.target.value) || DEFAULT_MAX_SIZE) })} className={`${field} ml-2 w-20`} aria-label="Section size limit" />
          </label>
          <label className="text-xs text-muted">Roll numbers
            <select value={edits.roll_order} onChange={(e) => setEdits({ ...edits, roll_order: e.target.value as Edits["roll_order"] })} className={`${field} ml-2`} aria-label="Roll number order">
              <option value="alpha">Alphabetical by name</option>
              <option value="keep">Keep last year&apos;s order</option>
            </select>
          </label>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={edits.copy_assignments} onChange={(e) => setEdits({ ...edits, copy_assignments: e.target.checked })} className="size-4 accent-navy-700" /> Copy subject-teacher assignments
          </label>
          {loading && <span className="flex items-center gap-1 text-xs text-muted" role="status"><Loader2 className="size-3.5 animate-spin" aria-hidden /> Updating the preview…</span>}
        </div>
      </Card>
      <TotalsTable classes={preview.classes} />
      <Checklist items={preview.checklist} />
      {newSections.length > 0 && (
        <Card className="mb-4">
          <h2 className="mb-2 font-semibold text-navy-900">New sections</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted"><tr><th className="py-1">Section</th><th className="py-1">Students</th><th className="py-1">Medium</th><th className="py-1">Class teacher</th></tr></thead>
              <tbody className="divide-y divide-border">
                {newSections.map((s) => {
                  const key = sectionKey(s.class_id, s.name);
                  return (
                    <tr key={key}>
                      <td className="py-1.5 font-medium text-navy-900">{s.class} – {s.name}</td>
                      <td className={`py-1.5 tabular-nums ${s.over_limit ? "font-semibold text-red-700" : ""}`}>{s.count}{s.over_limit ? ` (over ${preview.max_size})` : ""}</td>
                      <td className="py-1.5">
                        <select aria-label={`Medium of ${s.class} ${s.name}`} className={field} value={s.medium ?? ""} onChange={(e) => setEdits(setSection(edits, key, { medium: e.target.value }))}>
                          <option value="">Not set</option>
                          {mediums.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5">
                        <select aria-label={`Class teacher of ${s.class} ${s.name}`} className={field} value={s.class_teacher_id ?? ""} onChange={(e) => setEdits(setSection(edits, key, { class_teacher_id: e.target.value || null }))}>
                          <option value="">None</option>
                          {staff.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      <StudentTable
        rows={preview.students}
        onOutcome={(id, o) => setEdits(setStudent(edits, id, { outcome: o }))}
        onSection={(id, letter) => setEdits(setStudent(edits, id, { to_section: letter || undefined }))}
        onRoll={(id, roll) => setEdits(setStudent(edits, id, { roll_no: roll ?? undefined }))}
        onMany={(ids, o) => setEdits(setMany(edits, ids, o))}
      />
      <div className="mt-4"><ConfirmBox preview={preview} busy={busy} onConfirm={confirm} /></div>
    </div>
  );
}
