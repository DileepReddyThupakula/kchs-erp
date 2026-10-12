"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Printer, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Modal } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/form";
import { formatPaise } from "@/lib/money";
import { cancelReceiptAction } from "@/features/fees/actions";

export function ReceiptActions({ id, receiptNo, total, canCancel, cancelled }: { id: string; receiptNo: string; total: number; canCancel: boolean; cancelled: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Link href={`/print/receipt/${id}?copy=duplicate`} target="_blank" className={buttonClasses("primary")}>
        <Printer className="size-4" aria-hidden /> Print duplicate
      </Link>
      {canCancel && !cancelled && (
        <Button variant="secondary" onClick={() => setOpen(true)}>
          <XCircle className="size-4" /> Cancel receipt
        </Button>
      )}
      <Modal
        open={open}
        onClose={() => !busy && setOpen(false)}
        title={`Cancel receipt ${receiptNo}?`}
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>
              Keep it
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={reason.trim().length < 3}
              onClick={async () => {
                setBusy(true);
                const res = await cancelReceiptAction(id, reason);
                setBusy(false);
                if (res.error) return toast.error(res.error);
                toast.success(res.message);
                setOpen(false);
                router.refresh();
              }}
            >
              Cancel receipt
            </Button>
          </>
        }
      >
        <p className="mb-3">{formatPaise(total)} goes back to unpaid dues. The receipt number stays visible as cancelled.</p>
        <Field label="Reason" name="cancel-reason">
          <Input id="cancel-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}
