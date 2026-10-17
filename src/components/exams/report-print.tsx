"use client";
import { Printer } from "lucide-react";

/** A4 print wrapper: Print / Save PDF button, one card per page. */
export function ReportPrint({ children, count, warning }: { children: React.ReactNode; count: number; warning?: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-100 p-4 print:bg-white print:p-0">
      <style>{`@page { size: A4 portrait; margin: 0; } @media print { body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } article { box-shadow: none !important; margin: 0 !important; } article:last-of-type { break-after: auto !important; } }`}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-2 print:hidden">
        <p className="text-xs text-muted">{count} report card{count === 1 ? "" : "s"}. Choose “Save as PDF” in the print window to get a PDF file. Paper: A4. This print is recorded.</p>
        <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-700 px-4 text-sm font-medium text-white shadow-sm hover:bg-navy-800">
          <Printer className="size-4" /> Print / Save PDF
        </button>
      </div>
      {warning && <div className="mx-auto mb-4 max-w-[210mm] print:hidden">{warning}</div>}
      <div className="space-y-4 overflow-x-auto print:space-y-0 print:overflow-visible">
        <div className="mx-auto w-fit [&>article]:shadow-md">{children}</div>
      </div>
    </div>
  );
}
