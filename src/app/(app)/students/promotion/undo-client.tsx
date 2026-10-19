"use client";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UndoCard } from "@/components/promotion/undo-card";
import { undoRollover } from "@/features/promotion/actions";
import type { RunInfo } from "@/features/promotion/shared";

export function UndoClient({ run }: { run: RunInfo }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <UndoCard run={run} busy={busy} onUndo={() => start(async () => {
      const res = await undoRollover(run.id);
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(res.message);
      router.refresh();
    })} />
  );
}
