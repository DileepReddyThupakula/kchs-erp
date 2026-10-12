"use client";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Select } from "./form";

export function YearPicker({ years, value }: { years: { id: string; name: string; is_current: boolean }[]; value?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  if (years.length === 0) return null;
  return (
    <Select
      aria-label="Academic year"
      className="w-auto"
      value={value}
      onChange={(e) => {
        const p = new URLSearchParams(params);
        p.set("year", e.target.value);
        router.push(`${pathname}?${p}`);
      }}
    >
      {years.map((y) => (
        <option key={y.id} value={y.id}>
          {y.name}
          {y.is_current ? " (current)" : ""}
        </option>
      ))}
    </Select>
  );
}
