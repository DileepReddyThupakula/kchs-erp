"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { retryNoticeTranslation } from "@/features/notices/actions";

/** Telugu state of a published notice (Admin and duty): Auto-translated / Reviewed / pending with Retry. */
export function TeStatusRow({ id, status, hasTe }: { id: string; status: "none" | "pending" | "auto" | "reviewed"; hasTe: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <p className="mb-3 flex flex-wrap items-center gap-2 text-sm">
      <span className="text-muted">Telugu:</span>
      {status === "reviewed" && <Badge tone="success">Reviewed</Badge>}
      {status === "auto" && hasTe && <Badge tone="info">Auto-translated</Badge>}
      {status === "pending" && <Badge tone="warning">Translation pending</Badge>}
      {status === "none" && <Badge tone="neutral">No Telugu</Badge>}
      {(status === "pending" || status === "none") && (
        <Button
          variant="ghost"
          size="sm"
          loading={busy}
          onClick={async () => {
            setBusy(true);
            const r = await retryNoticeTranslation(id);
            setBusy(false);
            if (!r.ok) toast.error(r.error);
            else {
              toast.success(r.message ?? "Done.");
              router.refresh();
            }
          }}
        >
          <RefreshCw className="size-3.5" /> Translate now
        </Button>
      )}
      <span className="text-xs text-muted">{status === "auto" ? "Please have a Telugu speaker read it. Edit the notice to correct it." : "Edit the notice to type or correct the Telugu."}</span>
    </p>
  );
}
