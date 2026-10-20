"use client";
import { useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { loadCandidates, logBulkPhotos, planPhotos, recordPhoto, type PlanRow } from "@/features/id-cards/actions";
import { photoProblem } from "@/features/students/photo-rules";
import type { Candidate, SectionOption } from "@/features/id-cards/shared";

type Meta = { name: string; width: number; height: number; bytes: number; mime: string };
export const STATUS_TEXT: Record<PlanRow["status"], string> = { ok: "Ready", no_match: "No student has this admission number", duplicate: "Same student twice in this upload", student_left: "The student has left", problem: "Photo problem" };

async function dims(file: File): Promise<{ width: number; height: number }> {
  try {
    const bmp = await createImageBitmap(file);
    const d = { width: bmp.width, height: bmp.height };
    bmp.close();
    return d;
  } catch {
    return { width: 0, height: 0 };
  }
}

/** Bulk photo upload: files named by admission number (CI-01.jpg). A preview and a list of problems come first; nothing is saved until you press Save. */
export function BulkPhotos({ sections }: { sections: SectionOption[] }) {
  const input = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const [plan, setPlan] = useState<PlanRow[] | null>(null);
  const [saved, setSaved] = useState<{ done: number; failed: number } | null>(null);
  const [busy, start] = useTransition();
  const [sec, setSec] = useState("");
  const [list, setList] = useState<Candidate[] | null>(null);

  const choose = (fl: FileList | null) => {
    if (!fl?.length) return;
    setSaved(null);
    start(async () => {
      const m = new Map<string, File>();
      const metas: Meta[] = [];
      for (const f of Array.from(fl).slice(0, 500)) {
        const d = await dims(f);
        m.set(f.name, f);
        metas.push({ name: f.name, width: d.width, height: d.height, bytes: f.size, mime: f.type });
      }
      setFiles(m);
      const r = await planPhotos(metas);
      if (!r.ok) { toast.error(r.error); return; }
      // a friendly local reason next to the database's answer
      setPlan(r.rows.map((row) => {
        const meta = metas.find((x) => x.name === row.name);
        return row.status === "problem" && !row.problem && meta ? { ...row, problem: photoProblem(meta.width, meta.height, meta.bytes, meta.mime) } : row;
      }));
    });
  };

  const save = () => start(async () => {
    const sb = createClient();
    let done = 0, failed = 0;
    const classes = new Set<string>();
    for (const row of (plan ?? []).filter((r) => r.status === "ok" && r.student_id)) {
      const f = files.get(row.name);
      if (!f) { failed++; continue; }
      const meta = await dims(f);
      const path = `${row.student_id}/photo-${Date.now()}.${f.type === "image/png" ? "png" : "jpg"}`;
      const up = await sb.storage.from("student-photos").upload(path, f, { contentType: f.type });
      if (up.error) { failed++; continue; }
      const rec = await recordPhoto(row.student_id!, path, meta.width, meta.height, f.size, f.type);
      if (rec.ok) { done++; if (row.class) classes.add(row.class); } else failed++;
    }
    if (done > 0) await logBulkPhotos(done, [...classes].slice(0, 4).join(", "));
    setSaved({ done, failed });
    setPlan(null); setFiles(new Map());
    if (input.current) input.current.value = "";
    toast[failed ? "warning" : "success"](`${done} photo${done === 1 ? "" : "s"} saved${failed ? `, ${failed} failed` : ""}`);
  });

  const ok = (plan ?? []).filter((r) => r.status === "ok").length;
  const problems = (plan ?? []).filter((r) => r.status !== "ok");

  const showClass = (id: string) => { setSec(id); setList(null); if (!id) return; start(async () => { const r = await loadCandidates(id, null); if (r.ok) setList(r.rows); }); };

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="mb-1 font-semibold text-navy-900">1. Choose the photos</h2>
        <p className="mb-2 text-xs text-muted">Name each file with the student&apos;s admission number, for example <code>DEMO-BULK-09-013.jpg</code>. JPEG or PNG, at least 300 × 400 pixels, at most 5 MB, portrait. Up to 500 at a time. Photos are private and are never included in any Excel file.</p>
        <input ref={input} aria-label="Photos" type="file" multiple accept="image/jpeg,image/png" onChange={(e) => choose(e.target.files)} className="block text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-navy-800" />
      </Card>

      {plan && (
        <Card>
          <h2 className="mb-2 font-semibold text-navy-900">2. Check before saving</h2>
          <p className="text-sm" data-testid="plan-summary">{ok} ready to save · {problems.length} with a problem (these will not be saved)</p>
          {problems.length > 0 && (
            <ul aria-label="Problems" className="mt-2 divide-y divide-border rounded-lg border border-amber-200 bg-amber-50 text-sm text-amber-900">
              {problems.map((r) => <li key={r.name} className="px-3 py-1.5"><b>{r.name}</b>: {STATUS_TEXT[r.status]}{r.problem ? ` (${r.problem})` : ""}</li>)}
            </ul>
          )}
          <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[520px] text-sm"><tbody className="divide-y divide-border">
            {plan.filter((r) => r.status === "ok").map((r) => (
              <tr key={r.name}><td className="py-1.5 font-medium">{r.student}</td><td className="py-1.5 text-muted">{r.admission_no} · {r.class ?? "no class"}</td><td className="py-1.5 text-xs">{r.replaces ? <Badge tone="warning">Replaces the photo now saved</Badge> : <Badge tone="success">New photo</Badge>}</td><td className="py-1.5 text-xs text-muted">{r.name}</td></tr>
            ))}
          </tbody></table></div>
          <Button className="mt-3" type="button" onClick={save} loading={busy} disabled={ok === 0}><Upload className="size-4" aria-hidden /> Save {ok} photo{ok === 1 ? "" : "s"}</Button>
        </Card>
      )}
      {saved && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{saved.done} photo(s) saved{saved.failed ? `, ${saved.failed} could not be saved` : ""}. Only the count and the class were recorded in the log.</p>}

      <Card>
        <h2 className="mb-2 font-semibold text-navy-900">Who still needs a photo?</h2>
        <select aria-label="Section" className="mb-2 h-10 w-full max-w-xs rounded-lg border border-border bg-surface px-3 text-sm shadow-sm" value={sec} onChange={(e) => showClass(e.target.value)}>
          <option value="">Choose a section…</option>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        {list && (
          <>
            <p className="text-sm" data-testid="nophoto-count">{list.filter((r) => !r.has_photo && r.status === "active").length} of {list.length} have no photo.</p>
            <ul className="mt-1 divide-y divide-border text-sm">
              {list.map((r) => <li key={r.student_id} className="flex items-center justify-between py-1"><span>{r.name} <span className="text-xs text-muted">{r.admission_no}</span></span>{r.has_photo ? <Badge tone="success">Photo</Badge> : <Badge tone="warning">No photo</Badge>}</li>)}
            </ul>
          </>
        )}
      </Card>
    </div>
  );
}
