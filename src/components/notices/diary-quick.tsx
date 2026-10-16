"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { saveDiaryDay } from "@/features/notices/actions";
import { fmtLong } from "@/features/notices/shared";

export type QuickClass = { id: string; name: string; sections: { id: string; label: string }[]; subjects: { id: string; name: string }[] };
export type PriorEntry = { classId: string; sectionIds: string[]; subjectId: string | null; body: string; date: string };

type Line = { key: string; subjectId: string | null; label: string; body: string };

/** Quick entry: date + class, one line per subject, saved together. */
export function DiaryQuick({ classes, initialDate, initialClassId, prior }: { classes: QuickClass[]; initialDate: string; initialClassId?: string; prior: PriorEntry[] }) {
  const startClass = classes.find((c) => c.id === initialClassId) ?? classes[0];
  const router = useRouter();
  const [date, setDate] = useState(initialDate);
  const [classId, setClassId] = useState(startClass?.id ?? "");
  const cls = classes.find((c) => c.id === classId);
  const mk = (c: QuickClass | undefined): Line[] => [
    ...(c?.subjects ?? []).map((s) => ({ key: s.id, subjectId: s.id, label: s.name, body: "" })),
    { key: "remark", subjectId: null, label: "Class remark / note", body: "" },
  ];
  const [lines, setLines] = useState<Line[]>(() => mk(startClass));
  const [sections, setSections] = useState<string[]>(() => (startClass?.sections ?? []).map((s) => s.id));
  const [busy, setBusy] = useState<"" | "publish" | "draft">("");
  const [error, setError] = useState("");

  function pickClass(id: string) {
    const c = classes.find((x) => x.id === id);
    setClassId(id);
    setLines(mk(c));
    setSections((c?.sections ?? []).map((s) => s.id));
    setError("");
  }
  const filled = lines.filter((l) => l.body.trim().length >= 2);

  // yesterday's entries (the latest earlier day that has entries for this class) as a starting point
  const earlier = useMemo(() => {
    const days = [...new Set(prior.filter((p) => p.classId === classId && p.date < date).map((p) => p.date))].sort().reverse();
    return days[0] ?? null;
  }, [prior, classId, date]);

  function copyEarlier() {
    if (!earlier) return;
    const src = prior.filter((p) => p.classId === classId && p.date === earlier);
    setLines((ls) => ls.map((l) => ({ ...l, body: src.find((p) => p.subjectId === l.subjectId)?.body ?? l.body })));
    toast.success(`Copied the entries of ${fmtLong(earlier)}. Edit them before saving.`);
  }

  async function save(publish: boolean) {
    setError("");
    setBusy(publish ? "publish" : "draft");
    const r = await saveDiaryDay({ date, sectionIds: sections, items: filled.map((l) => ({ subjectId: l.subjectId, body: l.body })), publish });
    setBusy("");
    if (!r.ok) return setError(r.error);
    toast.success(r.message ?? "Saved.");
    setLines(mk(cls));
    router.refresh();
  }

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Date" name="dq-date">
          <Input id="dq-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" />
        </Field>
        <Field label="Class" name="dq-class">
          <Select id="dq-class" value={classId} onChange={(e) => pickClass(e.target.value)} className="min-w-40">
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="button" variant="secondary" disabled={!earlier} onClick={copyEarlier} title={earlier ? `Copy ${fmtLong(earlier)}` : "No earlier entries for this class"}>
          <Copy className="size-4" /> Copy yesterday&apos;s entries
        </Button>
      </div>

      <fieldset>
        <legend className="mb-1 text-sm font-medium text-navy-900">Sections</legend>
        <div className="flex flex-wrap gap-3">
          {(cls?.sections ?? []).map((s) => (
            <label key={s.id} className="inline-flex items-center gap-1.5 text-sm">
              <input type="checkbox" className="size-4 accent-navy-700" checked={sections.includes(s.id)} onChange={(e) => setSections((x) => (e.target.checked ? [...x, s.id] : x.filter((i) => i !== s.id)))} />
              {s.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="space-y-2">
        {lines.map((l) => (
          <div key={l.key} className="grid gap-1 sm:grid-cols-[11rem_1fr] sm:items-start sm:gap-3">
            <label htmlFor={`dq-${l.key}`} className="pt-2 text-sm font-medium text-navy-900">
              {l.label}
            </label>
            <Textarea id={`dq-${l.key}`} rows={2} value={l.body} placeholder={l.subjectId ? "Homework or note for this subject (leave empty to skip)" : "Anything for the whole class"} onChange={(e) => setLines((ls) => ls.map((x) => (x.key === l.key ? { ...x, body: e.target.value } : x)))} />
          </div>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button loading={busy === "publish"} disabled={!!busy || !filled.length || !sections.length} onClick={() => save(true)}>
          Save and publish ({filled.length} line{filled.length === 1 ? "" : "s"})
        </Button>
        <Button variant="secondary" loading={busy === "draft"} disabled={!!busy || !filled.length || !sections.length} onClick={() => save(false)}>
          Save as draft
        </Button>
        <span className="text-xs text-muted">All lines are saved together for {sections.length} section(s).</span>
      </div>
    </Card>
  );
}
