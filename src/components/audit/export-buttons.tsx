"use client";
import { useState, useTransition } from "react";
import { FileSpreadsheet, FileText } from "lucide-react";
import { toast } from "sonner";
import { buttonClasses } from "@/components/ui/button-classes";
import { exportSheets } from "@/lib/export";
import { exportAuditLog } from "@/features/audit/export-action";

/** Excel / CSV of the filtered entries. The database logs the export; nothing is shared or copied anywhere else. */
export function AuditExportButtons({ params, disabledReason }: { params: Record<string, string>; disabledReason?: string }) {
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const go = (format: "csv" | "xlsx") =>
    start(async () => {
      setBusy(format);
      const res = await exportAuditLog(params, format);
      setBusy(null);
      if ("error" in res) {
        toast.error(res.error);
        return;
      }
      await exportSheets("audit-log", format, [{ name: "Audit log", headers: res.headers, rows: res.rows, widths: [22, 22, 10, 18, 50, 24, 70] }]);
      toast.success(`Exported ${res.rows.length} entries`);
    });
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={pending || !!disabledReason} onClick={() => go("xlsx")} title={disabledReason} className={buttonClasses("secondary", "md")}>
        <FileSpreadsheet className="size-4" aria-hidden /> {busy === "xlsx" ? "Preparing…" : "Excel"}
      </button>
      <button type="button" disabled={pending || !!disabledReason} onClick={() => go("csv")} title={disabledReason} className={buttonClasses("secondary", "md")}>
        <FileText className="size-4" aria-hidden /> {busy === "csv" ? "Preparing…" : "CSV"}
      </button>
    </div>
  );
}
