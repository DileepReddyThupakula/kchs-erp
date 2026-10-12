"use client";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** From / To date filter that keeps the choice in the address (?from=&to=). */
export function RangeForm({ from, to, presets = true }: { from: string; to: string; presets?: boolean }) {
  const router = useRouter();
  const path = usePathname();
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const go = (a: string, b: string) => router.push(`${path}?from=${a}&to=${b}`);
  const iso = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
  const today = iso(new Date());
  const monthStart = today.slice(0, 8) + "01";
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (f && t && f <= t) go(f, t);
      }}
    >
      <label className="text-xs text-muted">
        From
        <input type="date" value={f} onChange={(e) => setF(e.target.value)} className="mt-0.5 block h-9 rounded-lg border border-border bg-surface px-2 text-sm text-foreground" />
      </label>
      <label className="text-xs text-muted">
        To
        <input type="date" value={t} onChange={(e) => setT(e.target.value)} className="mt-0.5 block h-9 rounded-lg border border-border bg-surface px-2 text-sm text-foreground" />
      </label>
      <Button type="submit" size="md" variant="secondary" disabled={!f || !t || f > t}>
        Show
      </Button>
      {presets && (
        <>
          <Button type="button" variant="ghost" size="sm" onClick={() => go(today, today)}>
            Today
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => go(monthStart, today)}>
            This month
          </Button>
        </>
      )}
    </form>
  );
}
