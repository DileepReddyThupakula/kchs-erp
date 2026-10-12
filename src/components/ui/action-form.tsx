"use client";
import { useActionState, useEffect, useRef, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { initialActionState, type ActionState, cn } from "@/lib/utils";
import { FormMessage } from "./form";
import { SubmitButton } from "./button";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

/** Show a toast whenever a server action returns a new result. */
function useResultToast(state: ActionState) {
  const last = useRef(state);
  useEffect(() => {
    if (state === last.current) return;
    last.current = state;
    if (state.error) toast.error(state.error);
    else if (state.ok && state.message) toast.success(state.message);
  }, [state]);
}

/**
 * Form bound to a server action that returns ActionState.
 * `children` receives field errors so inputs can show them.
 */
export function ActionForm({
  action,
  submitLabel = "Save",
  resetOnSuccess = false,
  className,
  children,
}: {
  action: Action;
  submitLabel?: string;
  resetOnSuccess?: boolean;
  className?: string;
  children: (fieldErrors: Record<string, string[] | undefined>) => React.ReactNode;
}) {
  const [state, formAction] = useActionState(action, initialActionState);
  const ref = useRef<HTMLFormElement>(null);
  useResultToast(state);
  useEffect(() => {
    if (state.ok && resetOnSuccess) ref.current?.reset();
  }, [state, resetOnSuccess]);
  return (
    <form ref={ref} action={formAction} className={className} noValidate={false}>
      {children(state.fieldErrors ?? {})}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-full">
        <SubmitButton>{submitLabel}</SubmitButton>
        <FormMessage state={state} />
      </div>
    </form>
  );
}

/** Small delete button that confirms first; result shown as a toast. */
export function DeleteButton({
  action,
  id,
  label = "Delete",
  confirmText = "Delete this? This cannot be undone.",
}: {
  action: Action;
  id: string;
  label?: string;
  confirmText?: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialActionState);
  useResultToast(state);
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(confirmText)) e.preventDefault();
      }}
      className="inline"
    >
      <input type="hidden" name="id" value={id} />
      <button
        disabled={pending}
        className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-red-700 transition-colors hover:bg-red-50 disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
        {label}
      </button>
    </form>
  );
}

/** Button for void server actions (no result state); confirms, then toasts. */
export function ConfirmButton({
  action,
  id,
  label,
  confirmText,
  doneText = "Done.",
  className = "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm text-red-700 transition-colors hover:bg-red-50",
  icon,
}: {
  action: (fd: FormData) => Promise<void>;
  id: string;
  label: string;
  confirmText?: string;
  doneText?: string;
  className?: string;
  icon?: React.ReactNode;
}) {
  const [pending, start] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className={cn(className, "disabled:opacity-60")}
      onClick={() => {
        if (confirmText && !confirm(confirmText)) return;
        const fd = new FormData();
        fd.set("id", id);
        start(async () => {
          try {
            await action(fd);
            toast.success(doneText);
          } catch {
            toast.error("That didn't work. Please try again.");
          }
        });
      }}
    >
      {pending ? <Loader2 className="size-3.5 animate-spin" /> : icon}
      {label}
    </button>
  );
}
