"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, Save } from "lucide-react";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/form";
import { saveGrades, saveRemark } from "@/features/exams/actions";

type St = { id: string; roll: number | null; name: string };

/** A grade (and an optional remark) per student for one subject and term. */
export function GradesGrid({ sectionId, termId, subjectId, subjectName, termName, locked, students, grades, needGrade, entries }: { sectionId: string; termId: string; subjectId: string; subjectName: string; termName: string; locked: boolean; students: St[]; grades: { code: string; label: string }[]; needGrade: boolean; entries: Record<string, { grade: string; remark: string }> }) {
  const router = useRouter();
  const [v, setV] = useState(() => Object.fromEntries(students.map((s) => [s.id, entries[s.id] ?? { grade: "", remark: "" }])));
  const [busy, setBusy] = useState(false);
  const dirty = students.filter((s) => v[s.id].grade !== (entries[s.id]?.grade ?? "") || v[s.id].remark !== (entries[s.id]?.remark ?? ""));
  async function save() {
    setBusy(true);
    const r = await saveGrades({ groupId: termId, sectionId, subjectId, rows: dirty.map((s) => ({ studentId: s.id, grade: v[s.id].grade, remark: v[s.id].remark })) });
    setBusy(false);
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message ?? "Saved.");
    router.refresh();
  }
  return (
    <Card className="space-y-2 p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="font-semibold text-navy-900">
          {subjectName} · {termName}
        </h2>
        {locked && (
          <Badge tone="warning">
            <Lock className="size-3" /> Locked
          </Badge>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[32rem] text-left text-sm">
          <thead className="bg-navy-50 text-xs uppercase tracking-wide text-muted">
            <tr>
              <th className="px-3 py-2">Roll</th>
              <th className="px-3 py-2">Student</th>
              <th className="px-3 py-2">Grade</th>
              <th className="px-3 py-2">Remark (optional)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {students.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-1.5 tabular-nums">{s.roll ?? "—"}</td>
                <td className="px-3 py-1.5 font-medium text-navy-900">{s.name}</td>
                <td className="px-3 py-1.5">
                  <Select aria-label={`Grade for ${s.name}`} className="h-9 w-40" disabled={locked} value={v[s.id].grade} onChange={(e) => setV((x) => ({ ...x, [s.id]: { ...x[s.id], grade: e.target.value } }))}>
                    <option value="">{needGrade ? "Choose…" : "—"}</option>
                    {grades.map((g) => (
                      <option key={g.code} value={g.code}>
                        {g.code} · {g.label}
                      </option>
                    ))}
                  </Select>
                </td>
                <td className="px-3 py-1.5">
                  <Input aria-label={`Remark for ${s.name}`} className="h-9" disabled={locked} value={v[s.id].remark} onChange={(e) => setV((x) => ({ ...x, [s.id]: { ...x[s.id], remark: e.target.value } }))} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!locked && (
        <div className="border-t border-border px-4 py-3">
          <Button loading={busy} disabled={!dirty.length} onClick={save}>
            <Save className="size-4" /> Save {dirty.length ? `(${dirty.length} changed)` : ""}
          </Button>
        </div>
      )}
    </Card>
  );
}

/** The class teacher's remark per student: a standard remark (English + Telugu) or their own words. */
export function RemarksGrid({ termId, termName, locked, students, bank, remarks }: { termId: string; termName: string; locked: boolean; students: St[]; bank: { id: string; en: string; te: string; verified: boolean }[]; remarks: Record<string, { bankId: string | null; en: string; te: string }> }) {
  const router = useRouter();
  const [v, setV] = useState(() => Object.fromEntries(students.map((s) => [s.id, remarks[s.id] ?? { bankId: null, en: "", te: "" }])));
  const [busy, setBusy] = useState("");
  async function save(id: string) {
    setBusy(id);
    const r = await saveRemark({ groupId: termId, studentId: id, bankId: v[id].bankId, en: v[id].en, te: v[id].te });
    setBusy("");
    if (!r.ok) return toast.error(r.error);
    toast.success(r.message ?? "Saved.");
    router.refresh();
  }
  return (
    <Card className="space-y-2 p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <h2 className="font-semibold text-navy-900">Class teacher remarks · {termName}</h2>
        {locked && (
          <Badge tone="warning">
            <Lock className="size-3" /> Locked
          </Badge>
        )}
        <span className="text-xs text-muted">Pick a standard remark (its Telugu comes with it) or type your own. Telugu is typed by you; nothing is machine-translated.</span>
      </div>
      <ul className="divide-y divide-border">
        {students.map((s) => (
          <li key={s.id} className="grid gap-2 px-4 py-3 lg:grid-cols-[12rem_1fr_1fr_auto] lg:items-start">
            <div>
              <p className="font-medium text-navy-900">{s.name}</p>
              <p className="text-xs text-muted">Roll {s.roll ?? "—"}</p>
            </div>
            <div className="space-y-1">
              <Select
                aria-label={`Standard remark for ${s.name}`}
                className="h-9"
                disabled={locked}
                value={v[s.id].bankId ?? ""}
                onChange={(e) => {
                  const b = bank.find((x) => x.id === e.target.value);
                  setV((x) => ({ ...x, [s.id]: { bankId: b?.id ?? null, en: b?.en ?? x[s.id].en, te: b?.te ?? x[s.id].te } }));
                }}
              >
                <option value="">Standard remark…</option>
                {bank.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.en.slice(0, 60)}
                  </option>
                ))}
              </Select>
              <Textarea aria-label={`Remark in English for ${s.name}`} rows={2} disabled={locked} value={v[s.id].en} onChange={(e) => setV((x) => ({ ...x, [s.id]: { ...x[s.id], en: e.target.value } }))} placeholder="English" />
            </div>
            <Textarea aria-label={`Remark in Telugu for ${s.name}`} lang="te" rows={3} disabled={locked} value={v[s.id].te} onChange={(e) => setV((x) => ({ ...x, [s.id]: { ...x[s.id], te: e.target.value } }))} placeholder="తెలుగు (optional)" />
            {!locked && (
              <Button size="sm" loading={busy === s.id} onClick={() => save(s.id)}>
                <Save className="size-4" /> Save
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
