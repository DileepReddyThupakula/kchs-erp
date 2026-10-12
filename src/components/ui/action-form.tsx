"use client";
import { startTransition, useActionState, useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save, Trash2 } from "lucide-react";
import { initialActionState, type ActionState, cn } from "@/lib/utils";
import { FormMessage } from "./form";
import { Button } from "./button";
import { ConfirmDialog } from "./dialog";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

/** Show a toast whenever a server action returns a new result. */
function useResultToast(state: ActionState, onSuccess?: () => void) {
  const last = useRef(state);
  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (state.error) toast.error(state.error);
    else if (state.ok) {
      if (state.message) toast.success(state.message);
      onSuccess?.();
    }
  }, [state, onSuccess]);
}

/**
 * Form bound to a server action that returns ActionState.
 * `children` receives field errors so inputs can show them.
 * layout="drawer": body scrolls, Save/Cancel bar sticks to the bottom.
 */
export function ActionForm({
  action,
  submitLabel = "Save",
  resetOnSuccess = false,
  className,
  layout = "inline",
  onSuccess,
  onCancel,
  children,
}: {
  action: Action;
  submitLabel?: string;
  resetOnSuccess?: boolean;
  className?: string;
  layout?: "inline" | "drawer";
  onSuccess?: () => void;
  onCancel?: () => void;
  children: (fieldErrors: Record<string, string[] | undefined>) => React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  useResultToast(state, onSuccess);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  // Submit via a handler (not the form `action` prop) so React doesn't clear
  // what the user typed when the server returns validation errors.
  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => formAction(fd));
  };

  if (layout === "drawer") {
    return (
      <form ref={ref} onSubmit={onSubmit} className="flex h-full flex-col">
        <div className={cn("flex-1 space-y-6 overflow-y-auto px-5 py-5", className)}>{children(state.fieldErrors ?? {})}</div>
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-cream-50/95 px-5 py-3 backdrop-blur">
          <FormMessage state={state.ok ? {} : state} />
          <div className="ml-auto flex gap-2">
            {onCancel && (
              <Button type="button" variant="secondary" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button type="submit" loading={pending}>
              {!pending && <Save className="size-4" aria-hidden />} {pending ? "Saving…" : submitLabel}
            </Button>
          </div>
        </div>
      </form>
    );
  }

  return (
    <form ref={ref} onSubmit={onSubmit} className={className}>
      {children(state.fieldErrors ?? {})}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-full">
        <Button type="submit" loading={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

/** Titled group of fields inside a long form. */
export function FormSection({
  title,
  description,
  children,
  columns = 2,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  columns?: 1 | 2 | 3;
  className?: string;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="mb-1">
        <span className="text-sm font-semibold text-navy-900">{title}</span>
        {description && <span className="block text-xs text-muted">{description}</span>}
      </legend>
      <div className={cn("grid gap-4", { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3" }[columns], className)}>{children}</div>
    </fieldset>
  );
}

/** Delete button with a confirmation dialog; result shown as a toast. */
export function DeleteButton({
  action,
  id,
  label = "Delete",
  confirmText = "This cannot be undone.",
  title = "Delete this?",
  iconOnly = false,
}: {
  action: Action;
  id: string;
  label?: string;
  confirmText?: string;
  title?: string;
  iconOnly?: boolean;
}) {
  const router = useRouter();
  return (
    <ConfirmDialog
      title={title}
      message={confirmText}
      confirmLabel={label}
      onConfirm={async () => {
        const fd = new FormData();
        fd.set("id", id);
        const res = await action({}, fd);
        if (res.error) toast.error(res.error);
        else {
          toast.success(res.message ?? "Deleted.");
          router.refresh();
        }
      }}
      trigger={(open) => (
        <button
          type="button"
          onClick={open}
          aria-label={iconOnly ? label : undefined}
          title={iconOnly ? label : undefined}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-red-700 transition-colors hover:bg-red-50"
        >
          <Trash2 className="size-4" aria-hidden />
          {!iconOnly && label}
        </button>
      )}
    />
  );
}

/** Button for void server actions; optional confirmation dialog, then a toast. */
export function ConfirmButton({
  action,
  id,
  label,
  confirmText,
  confirmTitle,
  doneText = "Done.",
  danger = true,
  className = "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-red-700 transition-colors hover:bg-red-50",
  icon,
}: {
  action: (fd: FormData) => Promise<void>;
  id: string;
  label: string;
  confirmText?: string;
  confirmTitle?: string;
  doneText?: string;
  danger?: boolean;
  className?: string;
  icon?: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = () =>
    new Promise<void>((resolve) => {
      const fd = new FormData();
      fd.set("id", id);
      start(async () => {
        try {
          await action(fd);
          toast.success(doneText);
          router.refresh();
        } catch (e) {
          toast.error(e instanceof Error && e.message ? e.message : "That didn't work. Please try again.");
        }
        resolve();
      });
    });

  const button = (onClick: () => void) => (
    <button type="button" disabled={pending} className={cn(className, "disabled:opacity-60")} onClick={onClick}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : icon}
      {label}
    </button>
  );
  if (!confirmText) return button(run);
  return (
    <ConfirmDialog
      title={confirmTitle ?? `${label}?`}
      message={confirmText}
      confirmLabel={label}
      tone={danger ? "danger" : "primary"}
      onConfirm={run}
      trigger={(open) => button(open)}
    />
  );
}
