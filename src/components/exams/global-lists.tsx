"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/form";
import { saveDescriptiveGrades, saveGradeBands, saveRemarkBank } from "@/features/exams/actions";

type Band = { grade: string; min_pct: number; max_pct: number; grade_point: number; is_fail: boolean };
type Bank = { id?: string; text_en: string; text_te: string; te_verified: boolean };

/** Lists that apply to the whole school: the grading scale, the co-scholastic grades and the standard remarks. */
export function GlobalLists({ bands, grades, bank }: { bands: Band[]; grades: { code: string; label: string }[]; bank: Bank[] }) {
  const router = useRouter();
  const [b, setB] = useState(bands.map((x) => ({ ...x, min_pct: String(x.min_pct), max_pct: String(x.max_pct), grade_point: String(x.grade_point) })));
  const [g, setG] = useState(grades);
  const [r, setR] = useState(bank);
  const [busy, setBusy] = useState("");
  async function run(key: string, p: Promise<{ ok: boolean; message?: string; error?: string }>) {
    setBusy(key);
    const x = await p;
    setBusy("");
    if (!x.ok) return toast.error(x.error);
    toast.success(x.message ?? "Saved.");
    router.refresh();
  }
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="space-y-2 lg:col-span-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-navy-900">Grading scale</h3>
          <Badge tone="warning">VERIFY against the official AP scale</Badge>
        </div>
        <p className="text-sm text-muted">A percentage gets the grade of the highest row whose “from” is not above it. The lowest row must start at 0. Changing it recalculates open results; locked results keep their grades.</p>
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead className="text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="pr-2 text-left">Grade</th>
                <th className="pr-2 text-left">From %</th>
                <th className="pr-2 text-left">To %</th>
                <th className="pr-2 text-left">Grade point</th>
                <th className="pr-2 text-left">Fail?</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {b.map((x, i) => (
                <tr key={i}>
                  {(["grade", "min_pct", "max_pct", "grade_point"] as const).map((k) => (
                    <td key={k} className="pr-2 py-0.5">
                      <Input aria-label={`${k} row ${i + 1}`} className="h-8 w-24" value={x[k]} onChange={(e) => setB((a) => a.map((y, j) => (j === i ? { ...y, [k]: e.target.value } : y)))} />
                    </td>
                  ))}
                  <td className="pr-2">
                    <input type="checkbox" aria-label={`Fail row ${i + 1}`} checked={x.is_fail} onChange={(e) => setB((a) => a.map((y, j) => (j === i ? { ...y, is_fail: e.target.checked } : y)))} />
                  </td>
                  <td>
                    <Button variant="ghost" size="sm" aria-label="Remove row" onClick={() => setB((a) => a.filter((_, j) => j !== i))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setB((a) => [...a, { grade: "", min_pct: "", max_pct: "", grade_point: "", is_fail: false }])}>
            <Plus className="size-4" /> Add a grade
          </Button>
          <Button size="sm" loading={busy === "bands"} onClick={() => run("bands", saveGradeBands(b.map((x) => ({ grade: x.grade, min_pct: Number(x.min_pct), max_pct: Number(x.max_pct), grade_point: Number(x.grade_point), is_fail: x.is_fail }))))}>
            Save grading scale
          </Button>
        </div>
      </Card>

      <Card className="space-y-2">
        <h3 className="font-semibold text-navy-900">Co-scholastic and descriptive grades</h3>
        <p className="text-sm text-muted">Used for Art, Work &amp; Computer, Physical &amp; Health, Value Education, and for Nursery to UKG. Never added into the marks.</p>
        {g.map((x, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input aria-label={`Grade code ${i + 1}`} className="h-8 w-16" value={x.code} onChange={(e) => setG((a) => a.map((y, j) => (j === i ? { ...y, code: e.target.value } : y)))} />
            <Input aria-label={`Grade meaning ${i + 1}`} className="h-8" value={x.label} onChange={(e) => setG((a) => a.map((y, j) => (j === i ? { ...y, label: e.target.value } : y)))} />
            <Button variant="ghost" size="sm" aria-label="Remove" onClick={() => setG((a) => a.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setG((a) => [...a, { code: "", label: "" }])}>
            <Plus className="size-4" /> Add
          </Button>
          <Button size="sm" loading={busy === "grades"} onClick={() => run("grades", saveDescriptiveGrades(g))}>
            Save
          </Button>
        </div>
      </Card>

      <Card className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-navy-900">Standard remarks (English and Telugu)</h3>
          <Badge tone="warning">Telugu: VERIFY</Badge>
        </div>
        <p className="text-sm text-muted">Class teachers pick one of these or type their own. A student&apos;s remark is never machine-translated. Tick “checked” once a Telugu speaker has read the Telugu.</p>
        {r.map((x, i) => (
          <div key={i} className="grid gap-1.5 rounded-lg border border-border p-2">
            <Textarea aria-label={`Remark in English ${i + 1}`} rows={2} value={x.text_en} onChange={(e) => setR((a) => a.map((y, j) => (j === i ? { ...y, text_en: e.target.value } : y)))} />
            <Textarea aria-label={`Remark in Telugu ${i + 1}`} lang="te" rows={2} value={x.text_te} onChange={(e) => setR((a) => a.map((y, j) => (j === i ? { ...y, text_te: e.target.value } : y)))} />
            <div className="flex items-center gap-3 text-sm">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={x.te_verified} onChange={(e) => setR((a) => a.map((y, j) => (j === i ? { ...y, te_verified: e.target.checked } : y)))} /> Telugu checked
              </label>
              <span className="flex-1" />
              <Button variant="ghost" size="sm" aria-label="Remove" onClick={() => setR((a) => a.filter((_, j) => j !== i))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          </div>
        ))}
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setR((a) => [...a, { text_en: "", text_te: "", te_verified: false }])}>
            <Plus className="size-4" /> Add a remark
          </Button>
          <Button size="sm" loading={busy === "bank"} onClick={() => run("bank", saveRemarkBank(r))}>
            Save remarks
          </Button>
        </div>
      </Card>
    </div>
  );
}
