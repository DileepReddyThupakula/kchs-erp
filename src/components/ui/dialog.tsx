"use client";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/** Native <dialog> (focus trap, Esc, inert background for free). */
function useDialog(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    d.addEventListener("cancel", onCancel);
    return () => d.removeEventListener("cancel", onCancel);
  }, [onClose]);
  return ref;
}

/**
 * Right-side drawer for create/edit forms. Children usually render a form
 * whose body scrolls and whose Save/Cancel bar sticks to the bottom
 * (see ActionForm layout="drawer").
 */
export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  const ref = useDialog(open, onClose);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={cn(
        "fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full bg-surface p-0 text-foreground shadow-2xl backdrop:bg-navy-950/40 backdrop:backdrop-blur-[2px] open:animate-[drawer-in_180ms_ease-out]",
        wide ? "max-w-3xl" : "max-w-xl",
      )}
    >
      {open && (
        <div className="flex h-full flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
              {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
            </div>
            <button onClick={onClose} className="grid size-9 place-items-center rounded-lg text-ink-muted hover:bg-navy-50" aria-label="Close">
              <X className="size-5" />
            </button>
          </div>
          <div className="min-h-0 flex-1">{children}</div>
        </div>
      )}
    </dialog>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const ref = useDialog(open, onClose);
  return (
    <dialog
      ref={ref}
      aria-label={title}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-auto w-[min(92vw,30rem)] rounded-2xl bg-surface p-0 text-foreground shadow-2xl backdrop:bg-navy-950/40 open:animate-rise"
    >
      {open && (
        <>
          <div className="px-5 pt-5">
            <h2 className="text-lg font-semibold text-navy-900">{title}</h2>
            <div className="mt-2 text-sm text-muted">{children}</div>
          </div>
          {footer && <div className="mt-5 flex justify-end gap-2 border-t border-border bg-cream-50 px-5 py-3">{footer}</div>}
        </>
      )}
    </dialog>
  );
}

/**
 * Confirmation dialog for destructive actions. Renders its trigger; on
 * confirm runs `onConfirm` (which may be async) with a loading state.
 */
export function ConfirmDialog({
  trigger,
  title,
  message,
  confirmLabel = "Delete",
  tone = "danger",
  onConfirm,
}: {
  trigger: (open: () => void) => React.ReactNode;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  onConfirm: () => Promise<unknown> | unknown;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const close = () => !busy && setOpen(false);
  return (
    <>
      {trigger(() => setOpen(true))}
      <Modal
        open={open}
        onClose={close}
        title={title}
        footer={
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={tone === "danger" ? "danger" : "primary"}
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await onConfirm();
                } finally {
                  setBusy(false);
                  setOpen(false);
                }
              }}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : tone === "danger" ? <AlertTriangle className="size-4" /> : null}
              {confirmLabel}
            </Button>
          </>
        }
      >
        {message}
      </Modal>
    </>
  );
}
