"use client";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { regenerateYearDues } from "@/features/fees/actions";

export function RegenerateButton({ yearId }: { yearId: string }) {
  const router = useRouter();
  return (
    <ConfirmDialog
      title="Recalculate dues for this year?"
      message="Dues of every student are rebuilt from the current amounts, plans and concessions. Payments already made are never changed or removed. Safe to repeat."
      confirmLabel="Recalculate"
      tone="primary"
      onConfirm={async () => {
        const fd = new FormData();
        fd.set("year_id", yearId);
        const res = await regenerateYearDues({}, fd);
        if (res.error) toast.error(res.error);
        else {
          toast.success(res.message);
          router.refresh();
        }
      }}
      trigger={(open) => (
        <Button variant="secondary" onClick={open}>
          <RefreshCw className="size-4" /> Recalculate dues
        </Button>
      )}
    />
  );
}
