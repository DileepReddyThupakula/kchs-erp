import { cn } from "@/lib/utils";
import type { ActionState } from "@/lib/utils";
import { AlertCircle, CheckCircle2 } from "lucide-react";

const control =
  "w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-[inset_0_1px_1px_rgb(1_26_55/0.03)] outline-none transition-[border-color,box-shadow] duration-150 placeholder:text-ink-muted/70 hover:border-navy-200 focus:border-navy-500 focus:ring-3 focus:ring-gold-300/40 disabled:cursor-not-allowed disabled:bg-cream-100 disabled:text-ink-muted aria-[invalid=true]:border-red-600";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cn(control, "h-10", className)} />;
}

/** Input with a leading icon (and optional trailing element, e.g. show/hide). */
export function IconInput({
  icon,
  trailing,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: React.ReactNode; trailing?: React.ReactNode }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-ink-muted [&_svg]:size-4">{icon}</span>
      <input {...props} className={cn(control, "h-11 pl-9", trailing ? "pr-11" : "", className)} />
      {trailing && <span className="absolute inset-y-0 right-1 flex items-center">{trailing}</span>}
    </div>
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn(control, className)} />;
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={cn(control, "h-10 pr-8", className)} />;
}

export function Field({
  label,
  name,
  hint,
  errors,
  children,
  className,
}: {
  label: string;
  name?: string;
  hint?: string;
  errors?: string[];
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={name} className="block text-sm font-medium text-foreground">
        {label}
      </label>
      {children}
      {hint && !errors?.length && <p className="text-xs text-muted">{hint}</p>}
      {errors?.map((e) => (
        <p key={e} className="flex items-center gap-1 text-xs text-danger">
          <AlertCircle className="size-3.5" aria-hidden /> {e}
        </p>
      ))}
    </div>
  );
}

/** Inline status line (toasts are the main feedback; this stays for screen readers / context). */
export function FormMessage({ state }: { state: ActionState }) {
  if (state.error) {
    return (
      <p role="alert" className="flex items-center gap-1.5 text-sm text-danger">
        <AlertCircle className="size-4" aria-hidden /> {state.error}
      </p>
    );
  }
  if (state.ok && state.message) {
    return (
      <p role="status" className="flex items-center gap-1.5 text-sm text-success">
        <CheckCircle2 className="size-4" aria-hidden /> {state.message}
      </p>
    );
  }
  return null;
}
