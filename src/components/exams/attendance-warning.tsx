import Link from "next/link";
import { TriangleAlert } from "lucide-react";

/** Shown to Admin before printing report cards when too many attendance sessions of the period were never marked. */
export function AttendanceWarning({ unmarked, total, pct, className }: { unmarked: number; total: number; pct: number; className?: string }) {
  return (
    <div role="alert" className={`flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 ${className ?? ""}`}>
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p>
        <b>
          {unmarked} of {total} attendance sessions ({pct}%) in this period were never marked.
        </b>{" "}
        The attendance printed on the cards will be incomplete. Mark or correct the missing days on the{" "}
        <Link href="/attendance" className="font-medium underline">
          Attendance
        </Link>{" "}
        page first, or print anyway knowing the figures are partial.
      </p>
    </div>
  );
}
