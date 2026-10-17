"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Lock, LockOpen } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Field, Textarea } from "@/components/ui/form";
import { lockComponent, lockGroup, unlockComponent, unlockGroup } from "@/features/exams/actions";

export type LockClass = { id: string; name: string; groups: { id: string; name: string; locked: boolean; pending: number; exams: number }[]; exams: { id: string; name: string; locked: boolean; note: string | null; pending: number }[] };

/** Lock and unlock per result (all its exams) or per exam. A lock needs every mark entered (Absent and N/A count as entered). */
export function LocksList({ classes, canChange }: { classes: LockClass[]; canChange: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [un, setUn] = useState<{ kind: "g" | "c"; id: string; name: string; reason: string } | null>(null);
  async function run(key: string, p: Promise<{ ok: boolean; message?: string; error?: string }>) {
    setBusy(key);
    const r = await p;
    setBusy("");
    if (!r.ok) {
      toast.error(r.error);
      return false;
    }
    toast.success(r.message ?? "Done.");
    router.refresh();
    return true;
  }
  if (!classes.length) return <EmptyState title="Nothing to lock yet">No exams or results are set up. Use the Scheme tab first.</EmptyState>;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">Once locked, nobody (not even Admin) can change the marks or results until Admin unlocks them with a reason. Report cards can be printed only for locked results. {canChange ? "" : "Only Admin can lock or unlock."}</p>
      {classes.map((c) => (
        <Card key={c.id} className="space-y-2">
          <h3 className="font-semibold text-navy-900">{c.name}</h3>
          <ul className="divide-y divide-border">
            {c.groups.map((g) => (
              <li key={g.id} className="flex flex-wrap items-center gap-2 py-2">
                <span className="font-medium">{g.name}</span>
                {g.locked ? (
                  <Badge tone="warning">
                    <Lock className="size-3" /> Locked
                  </Badge>
                ) : g.pending > 0 ? (
                  <Badge tone="warning">{g.pending} marks not entered</Badge>
                ) : (
                  <Badge tone="success">Ready to lock</Badge>
                )}
                <span className="text-xs text-muted">{g.exams} exam(s)</span>
                <span className="flex-1" />
                {canChange &&
                  (g.locked ? (
                    <Button variant="secondary" size="sm" onClick={() => setUn({ kind: "g", id: g.id, name: g.name, reason: "" })}>
                      <LockOpen className="size-4" /> Unlock
                    </Button>
                  ) : (
                    <Button size="sm" loading={busy === g.id} disabled={g.pending > 0} onClick={() => run(g.id, lockGroup(g.id))} title={g.pending > 0 ? "Enter every mark first (Absent and Not applicable count as entered)" : undefined}>
                      <Lock className="size-4" /> Lock
                    </Button>
                  ))}
              </li>
            ))}
          </ul>
          {c.exams.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-navy-700">Single exams</summary>
              <ul className="mt-1 divide-y divide-border">
                {c.exams.map((x) => (
                  <li key={x.id} className="flex flex-wrap items-center gap-2 py-1.5">
                    <span>{x.name}</span>
                    {x.locked ? <Badge tone="warning">Locked</Badge> : x.pending > 0 ? <Badge tone="warning">{x.pending} not entered</Badge> : <Badge tone="success">Complete</Badge>}
                    {x.note && <span className="text-xs text-muted">last unlock: {x.note}</span>}
                    <span className="flex-1" />
                    {canChange &&
                      (x.locked ? (
                        <Button variant="ghost" size="sm" onClick={() => setUn({ kind: "c", id: x.id, name: x.name, reason: "" })}>
                          Unlock
                        </Button>
                      ) : (
                        <Button variant="ghost" size="sm" disabled={x.pending > 0 || busy === x.id} onClick={() => run(x.id, lockComponent(x.id))}>
                          Lock
                        </Button>
                      ))}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      ))}
      {un && (
        <Modal
          open
          onClose={() => setUn(null)}
          title={`Unlock ${un.name}`}
          footer={
            <>
              <Button variant="secondary" onClick={() => setUn(null)}>
                Cancel
              </Button>
              <Button
                loading={busy === "un"}
                disabled={un.reason.trim().length < 3}
                onClick={async () => {
                  if (await run("un", un.kind === "g" ? unlockGroup(un.id, un.reason) : unlockComponent(un.id, un.reason))) setUn(null);
                }}
              >
                Unlock
              </Button>
            </>
          }
        >
          <div className="space-y-3 text-foreground">
            <p className="text-sm">Everything built from it (terms, the final) becomes editable again, and report cards cannot be printed until it is locked again. This is recorded in the audit log.</p>
            <Field label="Reason (required)" name="un-reason">
              <Textarea id="un-reason" rows={3} value={un.reason} onChange={(e) => setUn({ ...un, reason: e.target.value })} />
            </Field>
          </div>
        </Modal>
      )}
    </div>
  );
}
