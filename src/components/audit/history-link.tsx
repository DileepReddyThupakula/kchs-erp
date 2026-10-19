import Link from "next/link";
import { History } from "lucide-react";
import { buttonClasses } from "@/components/ui/button-classes";

/** "History" button on a student, receipt or staff page. Callers show it to the Admin only; the database refuses everyone else anyway. */
export function HistoryLink({ table, id }: { table: "students" | "fee_receipts" | "staff"; id: string }) {
  return (
    <Link href={`/audit-log/history?table=${table}&record=${encodeURIComponent(id)}`} className={buttonClasses("secondary")}>
      <History className="size-4" aria-hidden /> History
    </Link>
  );
}
