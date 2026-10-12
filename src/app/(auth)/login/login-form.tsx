"use client";
import { startTransition, useActionState, useState } from "react";
import { Eye, EyeOff, Lock, LogIn, Mail } from "lucide-react";
import { signIn } from "@/features/auth/actions";
import { IconInput } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { initialActionState } from "@/lib/utils";

const glassInput =
  "border-white/20 bg-white/90 text-navy-900 focus:border-gold-400 focus:ring-gold-400/40 placeholder:text-ink-muted/70";

export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, initialActionState);
  const [show, setShow] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => action(fd));
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor="email" className="text-sm font-medium text-cream-100">
          Email
        </label>
        <IconInput
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          placeholder="name@school"
          required
          icon={<Mail />}
          className={glassInput}
          aria-invalid={!!state.fieldErrors?.email}
        />
        {state.fieldErrors?.email && <p className="text-xs text-red-200">{state.fieldErrors.email[0]}</p>}
      </div>
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium text-cream-100">
          Password
        </label>
        <IconInput
          id="password"
          name="password"
          type={show ? "text" : "password"}
          autoComplete="current-password"
          required
          icon={<Lock />}
          className={glassInput}
          aria-invalid={!!state.fieldErrors?.password}
          trailing={
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="grid size-9 place-items-center rounded-md text-ink-muted hover:bg-navy-50 hover:text-navy-800"
              aria-label={show ? "Hide password" : "Show password"}
              aria-pressed={show}
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          }
        />
        {state.fieldErrors?.password && <p className="text-xs text-red-200">{state.fieldErrors.password[0]}</p>}
      </div>
      {state.error && (
        <p role="alert" className="rounded-lg border border-red-300/40 bg-red-600/20 px-3 py-2 text-sm text-red-50">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="accent" size="lg" className="w-full" loading={pending}>
        {!pending && <LogIn className="size-4" aria-hidden />} {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
