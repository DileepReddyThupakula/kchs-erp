"use client";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RunBadge, UndoNotice } from "./parts";
import { formatAuditTime } from "@/features/audit/shared";
import type { RunInfo } from "@/features/promotion/shared";

/** After a rollover: what was done, and the Undo button (or the plain reason it is blocked). */
export function UndoCard({ run, busy, onUndo }: { run: RunInfo; busy: boolean; onUndo: () => void }) {
  const [sure, setSure] = useState(false);
  const s = run.summary as Record<string, number>;
  return (
    <Card className="mb-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-navy-900">{run.from} → {run.to}</h2>
        <RunBadge status={run.status} />
      </div>
      <p className="text-sm text-muted">
        Started {formatAuditTime(run.applied_at)}{run.applied_by ? ` by ${run.applied_by}` : ""}: {s.promoted ?? 0} moved up, {s.detained ?? 0} repeating, {(s.passed_out ?? 0) + (s.left ?? 0)} left, {s.new_sections_created ?? 0} new sections.
      </p>
      {run.status === "applied" && run.undo && (
        <div className="mt-3 space-y-3">
          <UndoNotice undo={run.undo} />
          {run.undo.allowed && !sure && <Button type="button" variant="secondary" onClick={() => setSure(true)}>Undo this rollover</Button>}
          {run.undo.allowed && sure && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>This puts everything back as it was before Confirm. The old year is not touched. Undo now?</span>
              <Button type="button" variant="danger" loading={busy} onClick={onUndo}>Yes, undo</Button>
              <Button type="button" variant="ghost" onClick={() => setSure(false)}>No, keep it</Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
