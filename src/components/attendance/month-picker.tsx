"use client";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/form";

/** A date or month input that updates one query parameter on the reports page. */
export function MonthPicker({ kind, value, max, param, tab, extra, base = "/attendance/reports" }: { kind: "date" | "month"; value: string; max?: string; param: string; tab: string; extra?: string; base?: string }) {
  const router = useRouter();
  return (
    <Input
      type={kind}
      aria-label={kind === "date" ? "Date" : "Month"}
      value={value}
      max={max}
      className="w-44"
      onChange={(e) => e.target.value && router.push(`${base}?tab=${tab}&${param}=${e.target.value}${extra ? `&${extra}` : ""}`)}
    />
  );
}
