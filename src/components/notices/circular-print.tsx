"use client";
import { Printer } from "lucide-react";
import { CircularSheet, type CircularData } from "@/components/notices/circular-sheet";

/** A4 print of the circular (the same design as the screen and the image). Choose "Save as PDF" to get a file. */
export function CircularPrint({ data }: { data: CircularData }) {
  return (
    <div className="min-h-screen bg-neutral-100 p-4 print:bg-white print:p-0">
      <style>{`@page { size: A4 portrait; margin: 0; } @media print { body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-2 print:hidden">
        <p className="text-xs text-muted">Choose “Save as PDF” in the print window to get a PDF file. Paper: A4.</p>
        <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-700 px-4 text-sm font-medium text-white shadow-sm hover:bg-navy-800">
          <Printer className="size-4" /> Print / Save PDF
        </button>
      </div>
      <div className="overflow-x-auto print:overflow-visible">
        <div className="mx-auto bg-white shadow-md print:shadow-none" style={{ width: "210mm" }}>
          <CircularSheet data={data} layout="a4" />
        </div>
      </div>
    </div>
  );
}
