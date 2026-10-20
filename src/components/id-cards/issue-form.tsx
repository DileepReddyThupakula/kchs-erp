"use client";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { CardSheet } from "./sheet";
import type { CardSchool } from "./card-face";
import { issueCards, loadCandidates, previewCards } from "@/features/id-cards/actions";
import { PER_SHEET, type Bundle, type Candidate, type SectionOption } from "@/features/id-cards/shared";

const field = "h-10 w-full rounded-lg border border-border bg-surface px-3 text-sm shadow-sm";

/** Which students can get a card now, with the reason for those who cannot. */
export function eligible(c: Candidate, overrides: Record<string, string>, isAdmin: boolean): boolean {
  if (c.problem === null) return true;
  return c.problem === "No photo" && isAdmin && (overrides[c.student_id] ?? "").trim().length >= 3;
}

/** Issue cards: pick a section or a whole class, tick the students, look at the first sheet, then press Issue. The database checks everything again. */
export function IssueCardsForm({ sections, school, footer, isAdmin }: { sections: SectionOption[]; school: CardSchool; footer: string; isAdmin: boolean }) {
  const router = useRouter();
  const classes = useMemo(() => [...new Map(sections.map((s) => [s.class_id, s.class])).entries()], [sections]);
  const [scope, setScope] = useState("");              // "s:<section id>" or "c:<class id>"
  const [rows, setRows] = useState<Candidate[] | null>(null);
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ bundle: Bundle; photos: Record<string, string> } | null>(null);
  const [busy, start] = useTransition();

  useEffect(() => {
    if (!scope) return;
    setRows(null); setPreview(null);
    start(async () => {
      const r = await loadCandidates(scope.startsWith("s:") ? scope.slice(2) : null, scope.startsWith("c:") ? scope.slice(2) : null);
      if (!r.ok) { toast.error(r.error); return; }
      setRows(r.rows);
      setTicked(Object.fromEntries(r.rows.filter((x) => x.problem === null).map((x) => [x.student_id, true])));
    });
  }, [scope]);

  const chosen = (rows ?? []).filter((r) => ticked[r.student_id] && eligible(r, overrides, isAdmin));
  const skipped = (rows ?? []).filter((r) => r.problem !== null && !eligible(r, overrides, isAdmin));
  const sheets = Math.ceil(chosen.length / PER_SHEET);

  useEffect(() => {
    if (!chosen.length) { setPreview(null); return; }
    const t = setTimeout(() => start(async () => {
      const r = await previewCards(chosen.slice(0, PER_SHEET).map((c) => c.student_id));
      if (r.ok) setPreview({ bundle: r.bundle, photos: r.photos });
    }), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosen.map((c) => c.student_id).join(",")]);

  const issue = () => start(async () => {
    const ov = Object.fromEntries(chosen.filter((c) => c.problem === "No photo").map((c) => [c.student_id, overrides[c.student_id].trim()]));
    const r = await issueCards(chosen.map((c) => c.student_id), ov);
    if (!r.ok) { toast.error(r.error); return; }
    if (!r.batchId) { toast.error("No card was issued."); return; }
    toast.success(`Issued ${r.issued.length} card${r.issued.length === 1 ? "" : "s"}${r.skipped.length ? `, ${r.skipped.length} skipped` : ""}`);
    router.push(`/print/id-cards?batch=${r.batchId}&issued=1`);
  });

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-2 font-semibold text-navy-900">1. Who</h2>
        <label className="text-xs text-muted">Section or whole class
          <select aria-label="Section or class" className={field} value={scope} onChange={(e) => setScope(e.target.value)}>
            <option value="">Choose…</option>
            <optgroup label="One section">{sections.map((s) => <option key={s.id} value={`s:${s.id}`}>{s.label} ({s.students})</option>)}</optgroup>
            <optgroup label="A whole class (all its sections)">{classes.map(([id, name]) => <option key={id} value={`c:${id}`}>{name}</option>)}</optgroup>
          </select>
        </label>
        <p className="mt-1 text-xs text-muted">To print for one student, choose their section and tick only that student.</p>
      </Card>

      {rows && (
        <Card>
          <h2 className="mb-2 font-semibold text-navy-900">2. Students ({rows.length})</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs uppercase tracking-wide text-muted"><tr><th className="w-8 py-1" /><th className="py-1">Student</th><th className="py-1">Class</th><th className="py-1">Photo</th><th className="py-1">Card</th></tr></thead>
              <tbody className="divide-y divide-border">
                {rows.map((r) => {
                  const ok = eligible(r, overrides, isAdmin);
                  return (
                    <tr key={r.student_id} data-problem={r.problem ?? ""}>
                      <td className="py-1.5"><input type="checkbox" aria-label={`Include ${r.name}`} disabled={!ok} checked={!!ticked[r.student_id] && ok} onChange={(e) => setTicked({ ...ticked, [r.student_id]: e.target.checked })} /></td>
                      <td className="py-1.5"><span className="font-medium text-navy-900">{r.name}</span> <span className="text-xs text-muted">{r.admission_no}</span></td>
                      <td className="py-1.5 text-muted">{r.class} {r.section}{r.roll_no ? ` · ${r.roll_no}` : ""}</td>
                      <td className="py-1.5">
                        {r.has_photo ? <Badge tone="success">Photo</Badge> : <Badge tone="warning">No photo</Badge>}
                        {r.problem === "No photo" && isAdmin && (
                          <input aria-label={`Reason to issue ${r.name} without a photo`} className="ml-2 h-8 w-56 rounded-md border border-border bg-surface px-2 text-xs" placeholder="Reason to issue without a photo" value={overrides[r.student_id] ?? ""}
                            onChange={(e) => { setOverrides({ ...overrides, [r.student_id]: e.target.value }); setTicked({ ...ticked, [r.student_id]: true }); }} />
                        )}
                      </td>
                      <td className="py-1.5 text-xs">{r.card_number ? <Badge tone="info">{r.card_number}</Badge> : r.problem && r.problem !== "No photo" ? <span className="text-red-700">{r.problem}</span> : ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {rows && (
        <Card>
          <h2 className="mb-2 font-semibold text-navy-900">3. The sheets</h2>
          <p className="text-sm" aria-live="polite" data-testid="summary">{chosen.length} card{chosen.length === 1 ? "" : "s"} to issue on {sheets} sheet{sheets === 1 ? "" : "s"} of {PER_SHEET} (2 across, 5 down).</p>
          {skipped.length > 0 && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900" data-testid="skipped">
              <p className="font-medium">{skipped.length} student{skipped.length === 1 ? " is" : "s are"} skipped:</p>
              <ul className="list-disc pl-5">{skipped.map((s) => <li key={s.student_id}>{s.name}: {s.problem}{s.problem === "No photo" && !isAdmin ? " (add a photo first)" : ""}</li>)}</ul>
            </div>
          )}
          {preview && (
            <div className="mt-3 overflow-x-auto rounded-lg bg-neutral-200/70 p-3">
              <p className="mb-2 text-xs text-muted">The first sheet as it will print (front, then back). The numbers are given when you press Issue.</p>
              <div className="flex flex-wrap gap-3">
                <div style={{ zoom: 0.42 }}><CardSheet cards={preview.bundle.cards} side="front" school={school} photos={preview.photos} footer={footer} principal={preview.bundle.school.principal_name} /></div>
                <div style={{ zoom: 0.42 }}><CardSheet cards={preview.bundle.cards} side="back" school={school} photos={preview.photos} footer={footer} principal={preview.bundle.school.principal_name} /></div>
              </div>
            </div>
          )}
          <Button className="mt-3" type="button" onClick={issue} disabled={!chosen.length} loading={busy}>Issue {chosen.length} card{chosen.length === 1 ? "" : "s"}</Button>
        </Card>
      )}
    </div>
  );
}
