"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";

/** "Working days: X, Days present: Y" with a Copy button. */
export function CopyTotals({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 2000);
        } catch {
          window.prompt("Copy this text:", text);
        }
      }}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-navy-800 hover:bg-navy-50"
    >
      {done ? <Check className="size-4 text-peacock-700" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      {done ? "Copied" : "Copy"}
    </button>
  );
}
