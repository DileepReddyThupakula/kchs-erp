"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "./form";

/** A select that sets one URL query parameter (keeps the others). */
export function ParamSelect({ param, value, options, label, className }: { param: string; value: string; options: { value: string; label: string }[]; label: string; className?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  return (
    <Select
      aria-label={label}
      className={className ?? "w-auto"}
      value={value}
      onChange={(e) => {
        const p = new URLSearchParams(params);
        p.set(param, e.target.value);
        router.push(`${pathname}?${p}`);
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </Select>
  );
}
