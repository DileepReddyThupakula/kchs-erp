"use client";
import { startTransition, useActionState, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { History, ImageUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, FormMessage, Input } from "@/components/ui/form";
import { formatDate, initialActionState } from "@/lib/utils";
import { removePaymentQr, savePaymentSettings, uploadPaymentQr } from "@/features/fees/actions";
import { maskUpi } from "@/features/fees/upi";
import type { FeeSettingsView } from "@/features/fees/queries";

export function PaymentsTab({ settings }: { settings: FeeSettingsView }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(savePaymentSettings, initialActionState);
  const [up, upAction, upPending] = useActionState(uploadPaymentQr, initialActionState);
  const lastToast = useRef(state);
  const lastUp = useRef(up);
  if (state !== lastToast.current) {
    lastToast.current = state;
    if (state.error) toast.error(state.error);
    else if (state.ok) toast.success(state.message);
  }
  if (up !== lastUp.current) {
    lastUp.current = up;
    if (up.error) toast.error(up.error);
    else if (up.ok) {
      toast.success(up.message);
      router.refresh();
    }
  }
  const [removing, setRemoving] = useState(false);
  const fe = state.fieldErrors ?? {};

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <h2 className="mb-1 font-semibold text-navy-900">School UPI</h2>
        <p className="mb-4 text-sm text-muted">
          Shown to the office as a QR (for the exact amount) when a parent pays by UPI. The QR is made in the browser; nothing is sent to an outside service.
        </p>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(() => action(fd));
          }}
        >
          <Field label="UPI ID" name="upi_id" errors={fe.upi_id} hint="e.g. kchsschool@okbank">
            <Input id="upi_id" name="upi_id" defaultValue={settings.upiId ?? ""} autoComplete="off" />
          </Field>
          <Field label="Payee name" name="payee_name" errors={fe.payee_name} hint="Exactly as it appears in the UPI app">
            <Input id="payee_name" name="payee_name" defaultValue={settings.payeeName ?? ""} />
          </Field>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" name="require_upi_reference" defaultChecked={settings.requireUpiReference} className="mt-1 size-4 accent-navy-700" />
            <span>
              <span className="font-medium text-navy-900">Require reference for UPI</span>
              <span className="block text-xs text-muted">Off (default): the transaction ID is optional for UPI and bank transfer. Cheques always need the cheque number.</span>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" loading={pending}>
              {pending ? "Saving…" : "Save payment settings"}
            </Button>
            <FormMessage state={state.ok ? {} : state} />
          </div>
        </form>
        <div className="mt-5 flex items-start gap-2 rounded-lg bg-cream-100 px-3 py-2 text-xs text-muted">
          <History className="mt-0.5 size-4 shrink-0 text-navy-500" aria-hidden />
          <p>
            {settings.changedBy ? (
              <>
                Last changed by <span className="font-medium text-navy-900">{settings.changedBy}</span> on {settings.changedAt ? formatDate(settings.changedAt.slice(0, 10)) : "—"}
                {settings.upiId ? <> · current UPI ID {maskUpi(settings.upiId)}</> : null}.
              </>
            ) : (
              "Not set yet."
            )}{" "}
            Every change is recorded in the audit log (UPI ID partly hidden).
          </p>
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 font-semibold text-navy-900">Uploaded QR image (optional)</h2>
        <p className="mb-4 text-sm text-muted">Used only when no UPI ID is set above, for example the bank&apos;s printed QR. Parents then type the amount themselves.</p>
        {settings.qrUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={settings.qrUrl} alt="Uploaded school QR" className="mb-4 size-48 rounded-lg border border-border bg-white object-contain p-1" />
        ) : (
          <p className="mb-4 rounded-lg border border-dashed border-border px-3 py-6 text-center text-sm text-muted">No image uploaded.</p>
        )}
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(() => upAction(fd));
          }}
        >
          <input
            name="file"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-navy-800"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variant="secondary" loading={upPending}>
              <ImageUp className="size-4" /> {settings.qrUrl ? "Replace image" : "Upload image"}
            </Button>
            {settings.hasQrImage && (
              <ConfirmDialog
                title="Remove the QR image?"
                message="The office will no longer see this image on Collect fee."
                confirmLabel="Remove"
                onConfirm={async () => {
                  setRemoving(true);
                  const res = await removePaymentQr();
                  setRemoving(false);
                  if (res.error) toast.error(res.error);
                  else {
                    toast.success(res.message);
                    router.refresh();
                  }
                }}
                trigger={(open) => (
                  <Button type="button" variant="ghost" onClick={open} loading={removing}>
                    <Trash2 className="size-4" /> Remove
                  </Button>
                )}
              />
            )}
          </div>
          {up.fieldErrors?.file?.map((e) => (
            <p key={e} className="text-xs text-danger">{e}</p>
          ))}
          <p className="text-xs text-muted">PNG, JPG or WEBP, under 2 MB.</p>
        </form>
      </Card>
    </div>
  );
}
