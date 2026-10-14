"use client";
import { useState } from "react";
import { Printer } from "lucide-react";
import { LAYOUTS, ReceiptSheet, type ReceiptLayout, type ReceiptSchool } from "@/components/fees/receipt";
import type { ReceiptDetail } from "@/features/fees/queries";

export function PrintSheet({ data, duplicate, initialLayout, school }: { data: ReceiptDetail; duplicate: boolean; initialLayout: ReceiptLayout; school: ReceiptSchool }) {
  const [layout, setLayout] = useState<ReceiptLayout>(initialLayout);
  const paper = layout === "a5" ? "A5" : "A4";
  return (
    <div className="min-h-screen bg-neutral-100 p-4 print:bg-white print:p-0">
      <style>{`@page { size: ${paper} portrait; margin: ${layout === "a5" ? "9mm" : "14mm"}; } @media print { body { background: #fff !important; } [data-receipt] { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`}</style>

      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 print:hidden">
        <div role="radiogroup" aria-label="Print layout" className="inline-flex rounded-lg border border-border bg-white p-1 text-sm shadow-sm">
          {LAYOUTS.map((l) => (
            <button
              key={l.id}
              type="button"
              role="radio"
              aria-checked={layout === l.id}
              title={l.hint}
              onClick={() => setLayout(l.id)}
              className={`rounded-md px-3 py-1.5 ${layout === l.id ? "bg-navy-900 font-medium text-gold-400" : "text-navy-800 hover:bg-navy-50"}`}
            >
              {l.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">Choose “Save as PDF” in the print window to get a PDF file.</p>
        <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-700 px-4 text-sm font-medium text-white shadow-sm hover:bg-navy-800">
          <Printer className="size-4" /> Print / Save PDF
        </button>
      </div>
      <div className="print:m-0">
        <ReceiptSheet data={data} school={school} duplicate={duplicate} layout={layout} />
      </div>
    </div>
  );
}
