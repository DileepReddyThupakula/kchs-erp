"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { BellRing, Check, Lock, Save, Send } from "lucide-react";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/form";
import { AttachmentsPanel } from "@/components/notices/attachments-panel";
import { submitDiary } from "@/features/notices/actions";
import { fmtShort, STATUS_TEXT } from "@/features/notices/shared";
import type { MySubmission, SubmitCard } from "@/features/notices/diary-workflow";

const TONE = { new: "neutral", draft: "warning", submitted: "info", published: "success" } as const;

function Card1({ card, date }: { card: SubmitCard; date: string }) {
  const router = useRouter();
  const [body, setBody] = useState(card.body);
  const [busy, setBusy] = useState<"draft" | "submit" | null>(null);
  const [error, setError] = useState("");
  const dirty = body !== card.body;
  async function save(submit: boolean) {
    setBusy(submit ? "submit" : "draft");
    setError("");
    const r = await submitDiary({ sectionId: card.sectionId, date, subjectId: card.subjectId, body, submit });
    setBusy(null);
    if (!r.ok) return setError(r.error);
    toast.success(r.message ?? "Saved.");
    router.refresh();
  }
  return (
    <Card className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-navy-900">
          {card.sectionLabel} · {card.subjectName ?? "Class remark"}
        </h3>
        <Badge tone={TONE[card.status]}>{STATUS_TEXT[card.status]}</Badge>
        {card.reminded && card.status !== "submitted" && card.status !== "published" && (
          <Badge tone="gold">
            <BellRing className="size-3" /> Reminder from the office
          </Badge>
        )}
        {card.kind === "remark" && <span className="text-xs text-muted">You are the class teacher: a note for the whole class.</span>}
      </div>
      {card.locked ? (
        <div className="space-y-1">
          <p className="flex items-center gap-1.5 text-sm text-muted">
            <Lock className="size-4" aria-hidden /> Published. Ask the school office if it needs a change.
          </p>
          <p className="whitespace-pre-wrap text-sm">{card.body}</p>
          
        </div>
      ) : (
        <>
          <label className="block text-sm font-medium" htmlFor={`b-${card.key}`}>
            Homework / remark (English)
          </label>
          <Textarea id={`b-${card.key}`} rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={card.kind === "remark" ? "e.g. Parent meeting on Friday" : "e.g. Exercise 4.2, questions 1–5"} />
          <p className="text-xs text-muted">Write in English. The Telugu is added automatically after you submit.</p>
          <AttachmentsPanel kind="diary" parentId={card.entryId} files={card.files} canEdit={!card.locked} />
          {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" loading={busy === "draft"} disabled={busy !== null || body.trim().length < 2} onClick={() => save(false)}>
              <Save className="size-4" /> Save draft
            </Button>
            <Button size="sm" loading={busy === "submit"} disabled={busy !== null || body.trim().length < 2 || (card.status === "submitted" && !dirty)} onClick={() => save(true)}>
              {card.status === "submitted" ? <Check className="size-4" /> : <Send className="size-4" />} {card.status === "submitted" ? "Update submission" : "Submit"}
            </Button>
          </div>
        </>
      )}
    </Card>
  );
}

export function SubmitCards({ date, cards }: { date: string; cards: SubmitCard[] }) {
  const todo = cards.filter((c) => c.status === "new" || c.status === "draft").length;
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">
        {cards.length} to write · {todo ? <b className="text-amber-800">{todo} not submitted yet</b> : <span className="text-peacock-700">all submitted</span>}
      </p>
      <div className="grid gap-3 lg:grid-cols-2">
        {cards.map((c) => (
          <Card1 key={c.key} card={c} date={date} />
        ))}
      </div>
    </div>
  );
}

export function MySubmissions({ rows }: { rows: MySubmission[] }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 font-semibold text-navy-900">My submissions</h2>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">Nothing submitted recently.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="bg-navy-50 text-xs uppercase tracking-wide text-muted">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Section</th>
                <th className="px-3 py-2">Subject</th>
                <th className="px-3 py-2">Text</th>
                <th className="px-3 py-2">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap px-3 py-2">{fmtShort(r.date)}</td>
                  <td className="whitespace-nowrap px-3 py-2">{r.sectionLabel}</td>
                  <td className="whitespace-nowrap px-3 py-2">{r.subject}</td>
                  <td className="max-w-xs truncate px-3 py-2">{r.body}</td>
                  <td className="px-3 py-2">
                    <Badge tone={TONE[r.status]}>{STATUS_TEXT[r.status]}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
