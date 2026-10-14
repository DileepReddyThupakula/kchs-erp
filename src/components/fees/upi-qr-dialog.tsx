"use client";
import { useEffect, useState } from "react";
import { QrCode } from "lucide-react";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/money";
import { buildUpiUri } from "@/features/fees/upi";

export type QrSettings = { upiId: string | null; payeeName: string | null; qrUrl: string | null };

/**
 * Large dialog for the parent to scan. With a UPI id the QR is generated HERE
 * in the browser (qrcode library) for the exact amount; nothing is sent to
 * any outside service. Otherwise the uploaded static QR image is shown.
 */
export function UpiQrDialog({
  open,
  onClose,
  settings,
  amountPaise,
  studentName,
  adm,
}: {
  open: boolean;
  onClose: () => void;
  settings: QrSettings;
  amountPaise: number;
  studentName: string | null;
  adm: string | null;
}) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const canGenerate = !!(settings.upiId && settings.payeeName);
  const uri = canGenerate
    ? buildUpiUri({ upiId: settings.upiId!, payeeName: settings.payeeName!, amountPaise, note: adm ? `Fee ${adm}` : "School fee" })
    : null;

  useEffect(() => {
    let cancelled = false;
    if (!open || !uri) {
      setDataUrl(null);
      return;
    }
    import("qrcode")
      .then((m) => m.toDataURL(uri, { width: 520, margin: 2, errorCorrectionLevel: "M", color: { dark: "#011a37", light: "#ffffff" } }))
      .then((url) => !cancelled && setDataUrl(url))
      .catch(() => !cancelled && setDataUrl(null));
    return () => {
      cancelled = true;
    };
  }, [open, uri]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Scan to pay"
      footer={
        <Button onClick={onClose}>
          Done
        </Button>
      }
    >
      {!canGenerate && !settings.qrUrl ? (
        <p className="py-6 text-center text-base text-foreground">Ask the Admin to set the school QR in Fee setup.</p>
      ) : (
        <div className="flex flex-col items-center gap-3 text-foreground">
          {canGenerate ? (
            dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={dataUrl} alt={`UPI QR code to pay ${formatPaise(amountPaise)}`} className="size-72 max-w-full rounded-xl border border-border bg-white p-1 sm:size-80" />
            ) : (
              <div className="grid size-72 place-items-center rounded-xl border border-dashed border-border text-muted">
                <QrCode className="size-10 animate-pulse" aria-hidden />
              </div>
            )
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={settings.qrUrl!} alt="School payment QR code" className="size-72 max-w-full rounded-xl border border-border bg-white object-contain p-1 sm:size-80" />
          )}
          {canGenerate ? (
            <p className="text-5xl font-bold tabular-nums text-navy-900">{formatPaise(amountPaise, { fixed: true })}</p>
          ) : (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-center text-sm text-amber-800">
              This is the school&apos;s fixed QR. The parent must type the amount{amountPaise > 0 ? ` (${formatPaise(amountPaise, { fixed: true })})` : ""} in their UPI app.
            </p>
          )}
          <div className="text-center">
            {settings.payeeName && <p className="text-xl font-semibold text-navy-900">{settings.payeeName}</p>}
            {studentName && (
              <p className="text-lg text-navy-800">
                {studentName} {adm && <span className="font-mono text-sm text-muted">· {adm}</span>}
              </p>
            )}
            {canGenerate && <p className="mt-1 text-xs text-muted">{settings.upiId}</p>}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** "I have seen the payment…" tick + the honest note, shown for UPI payments. */
export function UpiConfirm({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="rounded-lg border border-gold-200 bg-gold-50 p-3 text-sm">
      <label className="flex cursor-pointer items-start gap-2 font-medium text-navy-900">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 accent-navy-700" />
        I have seen the payment in the bank / UPI app
      </label>
      <p className="mt-1 pl-6 text-xs text-muted">This system cannot check the bank. Tick only after you have seen the money arrive.</p>
    </div>
  );
}
