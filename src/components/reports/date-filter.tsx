"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Date box(es) for a report that keep every other address parameter (tab, year, result…). `range` = From + To; `asof` = one date. */
export function DateFilter({ mode, from, to, upto }: { mode: "range" | "asof"; from?: string; to?: string; upto?: string }) {
  const router = useRouter();
  const path = usePathname();
  const sp = useSearchParams();
  const [f, setF] = useState(from ?? "");
  const [t, setT] = useState(to ?? "");
  const [u, setU] = useState(upto ?? "");
  const go = (vals: Record<string, string>) => {
    const p = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(vals)) (v ? p.set(k, v) : p.delete(k));
    router.push(`${path}?${p}`);
  };
  const box = "mt-0.5 block h-9 rounded-lg border border-border bg-surface px-2 text-sm text-foreground";
  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (mode === "range") {
          if (f && t && f <= t) go({ from: f, to: t });
        } else if (u) go({ upto: u });
      }}
    >
      {mode === "range" ? (
        <>
          <label className="text-xs text-muted">
            From
            <input type="date" value={f} onChange={(e) => setF(e.target.value)} className={box} />
          </label>
          <label className="text-xs text-muted">
            To
            <input type="date" value={t} onChange={(e) => setT(e.target.value)} className={box} />
          </label>
        </>
      ) : (
        <label className="text-xs text-muted">
          Dues up to
          <input type="date" value={u} onChange={(e) => setU(e.target.value)} className={box} />
        </label>
      )}
      <Button type="submit" size="md" variant="secondary" disabled={mode === "range" ? !f || !t || f > t : !u}>
        Show
      </Button>
    </form>
  );
}
