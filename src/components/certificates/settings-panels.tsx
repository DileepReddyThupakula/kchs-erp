"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { confirmTelugu, confirmWording, saveText, savePrefixes, setDraft, setSignatureImage, setStartNumber, type Res } from "@/features/certificates/actions";
import { KIND_LABEL, KIND_SHORT, KINDS, type Kind, type TextEntry } from "@/features/certificates/shared";

const field = "h-9 w-full rounded-lg border border-border bg-surface px-2.5 text-sm shadow-sm";
export type TemplateRow = { kind: Kind; title_en: string; title_te: string; texts: Record<string, TextEntry>; layout_draft: boolean; wording_confirmed: boolean };
export type SeriesRow = { kind: Kind; next_no: number; start_no: number; issued: number };

function useDo() {
  const router = useRouter();
  const [busy, start] = useTransition();
  const run = (fn: () => Promise<Res>, done: string) => start(async () => {
    const r = await fn();
    if (!r.ok) { toast.error(r.error); return; }
    toast.success(done);
    router.refresh();
  });
  return { busy, run };
}

export function NumberingPanel({ prefixes, series, yearId, yearName }: { prefixes: { tc: string; bonafide: string; study: string }; series: SeriesRow[]; yearId: string; yearName: string }) {
  const { busy, run } = useDo();
  const [p, setP] = useState(prefixes);
  const [starts, setStarts] = useState<Record<string, string>>(Object.fromEntries(series.map((s) => [s.kind, String(s.next_no)])));
  return (
    <Card className="mb-4">
      <h2 className="mb-1 font-semibold text-navy-900">Numbering</h2>
      <p className="mb-3 text-xs text-muted">Each type has its own gap-free numbers per academic year, for example TC/{yearName}/001. A number is given only when a certificate is issued, and a cancelled number is never reused.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        {KINDS.map((k) => <label key={k} className="text-xs text-muted">{KIND_SHORT[k]} prefix<input aria-label={`${KIND_SHORT[k]} prefix`} className={field} value={p[k]} maxLength={12} onChange={(e) => setP({ ...p, [k]: e.target.value })} /></label>)}
      </div>
      <Button className="mt-3" type="button" variant="secondary" loading={busy} onClick={() => run(() => savePrefixes(p.tc, p.bonafide, p.study), "Prefixes saved")}>Save prefixes</Button>
      <p className="mt-1 text-xs text-muted">A new prefix applies to numbers given from now on. Numbers already issued are never rewritten.</p>
      <div className="mt-4 border-t border-border pt-3">
        <h3 className="mb-2 text-sm font-medium text-navy-900">Starting number for {yearName}</h3>
        <ul className="space-y-2">
          {series.map((s) => {
            const locked = s.issued > 0;
            return (
              <li key={s.kind} className="flex flex-wrap items-center gap-2 text-sm">
                <span className="w-24 font-medium">{KIND_SHORT[s.kind]}</span>
                <input aria-label={`${KIND_SHORT[s.kind]} starting number`} type="number" min={1} className={`${field} w-28`} value={starts[s.kind]} disabled={locked} onChange={(e) => setStarts({ ...starts, [s.kind]: e.target.value })} />
                <Button type="button" size="sm" variant="secondary" disabled={locked || busy} onClick={() => run(() => setStartNumber(s.kind, yearId, Number(starts[s.kind])), "Starting number saved")}>Set</Button>
                <span className="text-xs text-muted">{locked ? `Locked: ${s.issued} issued this year, next is ${s.next_no}` : "No certificate of this type yet this year: you can still change it (for example to continue the school's old register)"}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

export function DraftPanel({ templates }: { templates: TemplateRow[] }) {
  const { busy, run } = useDo();
  const [sure, setSure] = useState(false);
  const tc = templates.find((t) => t.kind === "tc");
  return (
    <Card className="mb-4">
      <h2 className="mb-1 font-semibold text-navy-900">Layout and wording status</h2>
      <p className="mb-3 text-xs text-muted">Until the TC layout is confirmed, every TC print says “DRAFT layout - not for issue” and a real TC cannot be issued (a preview always works).</p>
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="font-medium">{KIND_LABEL.tc}:</span>
        {tc?.layout_draft ? <Badge tone="warning">DRAFT layout: issuing is blocked</Badge> : <Badge tone="success">Layout confirmed</Badge>}
        {tc?.layout_draft && !sure && <Button type="button" size="sm" variant="secondary" onClick={() => setSure(true)}>I compared it with a real TC: switch the draft off</Button>}
        {tc?.layout_draft && sure && (
          <span className="flex items-center gap-2">Only do this when the printout matches the real TC. <Button type="button" size="sm" loading={busy} onClick={() => run(() => setDraft("tc", false), "TC layout confirmed")}>Yes, switch it off</Button><Button type="button" size="sm" variant="ghost" onClick={() => setSure(false)}>No</Button></span>
        )}
        {tc && !tc.layout_draft && <Button type="button" size="sm" variant="ghost" loading={busy} onClick={() => run(() => setDraft("tc", true), "TC layout is a draft again")}>Make it a draft again</Button>}
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {templates.map((t) => (
          <li key={t.kind} className="flex flex-wrap items-center gap-2"><span className="w-24 font-medium">{KIND_SHORT[t.kind]}</span>
            {t.wording_confirmed ? <Badge tone="success">Wording confirmed by the school</Badge> : <Badge tone="warning">Draft wording, to be confirmed by the school</Badge>}
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => run(() => confirmWording(t.kind, !t.wording_confirmed), t.wording_confirmed ? "Marked as draft wording" : "Wording confirmed")}>{t.wording_confirmed ? "Mark as draft again" : "The school confirmed this wording"}</Button></li>
        ))}
      </ul>
    </Card>
  );
}

export function SignaturePanel({ on }: { on: boolean }) {
  const { busy, run } = useDo();
  return (
    <Card className="mb-4">
      <h2 className="mb-1 font-semibold text-navy-900">Principal&apos;s signature image</h2>
      <p className="mb-2 text-xs text-muted">Off by default: certificates have a blank box for a handwritten signature and the school seal. Switching this on is recorded in the audit log.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="size-4 accent-navy-700" checked={on} disabled={busy} onChange={(e) => run(() => setSignatureImage(e.target.checked), e.target.checked ? "Signature image switched on" : "Signature image switched off")} /> Print the signature image from School settings</label>
    </Card>
  );
}

/** The wording: one text at a time. Changing the Telugu of a text marks it "needs checking" again. */
export function WordingPanel({ templates }: { templates: TemplateRow[] }) {
  const { busy, run } = useDo();
  const [open, setOpen] = useState<Kind | null>(null);
  const [edit, setEdit] = useState<Record<string, { en: string; te: string }>>({});
  return (
    <Card className="mb-4">
      <h2 className="mb-1 font-semibold text-navy-900">Wording (English and Telugu)</h2>
      <p className="mb-3 text-xs text-muted">Every Telugu text starts as “needs checking”. A Telugu print shows a warning until a Telugu speaker has checked them all. Names and reasons typed for a student are never changed or translated here.</p>
      {templates.map((t) => {
        const entries = Object.entries(t.texts);
        const unchecked = entries.filter(([, v]) => !v.te_checked).length;
        return (
          <div key={t.kind} className="mb-2 rounded-lg border border-border">
            <button type="button" aria-expanded={open === t.kind} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium text-navy-900" onClick={() => setOpen(open === t.kind ? null : t.kind)}>
              <span>{KIND_LABEL[t.kind]}</span>{unchecked > 0 ? <Badge tone="warning">{unchecked} Telugu text(s) need checking</Badge> : <Badge tone="success">Telugu checked</Badge>}
            </button>
            {open === t.kind && (
              <div className="space-y-2 border-t border-border p-3">
                {unchecked > 0 && <Button type="button" size="sm" variant="secondary" loading={busy} onClick={() => run(() => confirmTelugu(t.kind), "Telugu marked as checked")}>A Telugu speaker has checked all of these</Button>}
                {entries.map(([key, v]) => {
                  const id = `${t.kind}:${key}`;
                  const cur = edit[id] ?? { en: v.en, te: v.te };
                  return (
                    <div key={key} className="grid gap-2 sm:grid-cols-[8rem_1fr_1fr_auto] sm:items-start">
                      <span className="pt-2 text-xs font-medium text-muted">{key.replace(/_/g, " ")}</span>
                      <textarea aria-label={`${t.kind} ${key} English`} rows={cur.en.length > 70 ? 3 : 1} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" value={cur.en} onChange={(e) => setEdit({ ...edit, [id]: { ...cur, en: e.target.value } })} />
                      <textarea aria-label={`${t.kind} ${key} Telugu`} lang="te" rows={cur.te.length > 50 ? 3 : 1} className="rounded-lg border border-border bg-surface px-2 py-1.5 text-sm" value={cur.te} onChange={(e) => setEdit({ ...edit, [id]: { ...cur, te: e.target.value } })} />
                      <span className="flex flex-col items-start gap-1">
                        {v.te_checked ? <Badge tone="success">Checked</Badge> : <Badge tone="warning">Needs checking</Badge>}
                        {edit[id] && (edit[id].en !== v.en || edit[id].te !== v.te) && <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => run(() => saveText(t.kind, key, cur.en, cur.te), "Wording saved")}>Save</Button>}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </Card>
  );
}
