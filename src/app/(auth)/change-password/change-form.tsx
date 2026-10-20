"use client";
import { startTransition, useActionState } from "react";
import { KeyRound, Lock } from "lucide-react";
import { changeOwnPassword } from "@/features/auth/actions";
import { IconInput } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { initialActionState } from "@/lib/utils";

const glassInput = "border-white/20 bg-white/90 text-navy-900 focus:border-gold-400 focus:ring-gold-400/40 placeholder:text-ink-muted/70";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changeOwnPassword, initialActionState);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      {(["password", "confirm"] as const).map((name) => (
        <div key={name} className="space-y-1.5">
          <label htmlFor={name} className="text-sm font-medium text-cream-100">{name === "password" ? "New password" : "New password again"}</label>
          <IconInput id={name} name={name} type="password" autoComplete="new-password" required minLength={10} icon={<Lock />} className={glassInput} aria-invalid={!!state.fieldErrors?.[name]} />
          {state.fieldErrors?.[name] && <p className="text-xs text-red-200">{state.fieldErrors[name]![0]}</p>}
        </div>
      ))}
      {state.error && <p role="alert" className="rounded-lg border border-red-300/40 bg-red-600/20 px-3 py-2 text-sm text-red-50">{state.error}</p>}
      <Button type="submit" variant="accent" size="lg" className="w-full" loading={pending}>
        {!pending && <KeyRound className="size-4" aria-hidden />} {pending ? "Saving…" : "Save my password"}
      </Button>
    </form>
  );
}
