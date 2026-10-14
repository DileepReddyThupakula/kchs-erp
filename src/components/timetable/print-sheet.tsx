"use client";
import { Printer } from "lucide-react";
import { TimetableGrid, type GridCell } from "@/components/timetable/grid";
import type { Slot } from "@/features/timetable/shared";

/** A4 landscape timetable with the school letterhead. Black on white. */
export function TimetablePrintSheet({
  school,
  title,
  subtitle,
  refSlots,
  days,
  cells,
  footer,
}: {
  school: { name: string; address: string; phone: string | null; logoUrl: string };
  title: string;
  subtitle: string;
  refSlots: Slot[];
  days: number[];
  cells: Record<string, GridCell>;
  footer?: string;
}) {
  return (
    <div className="min-h-screen bg-neutral-100 p-4 print:bg-white print:p-0">
      <style>{`@page { size: A4 landscape; margin: 10mm; } @media print { body { background: #fff !important; } }`}</style>
      <div className="mx-auto mb-4 flex max-w-[277mm] items-center justify-between gap-2 print:hidden">
        <p className="text-xs text-muted">Choose “Save as PDF” in the print window to get a PDF file. Paper: A4 landscape.</p>
        <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-700 px-4 text-sm font-medium text-white shadow-sm hover:bg-navy-800">
          <Printer className="size-4" /> Print / Save PDF
        </button>
      </div>
      <article className="mx-auto bg-white p-[8mm] text-black shadow-md print:shadow-none" style={{ width: "277mm", border: "2px solid #011a37", outline: "1px solid #b8962e", outlineOffset: "-5px" }}>
        <header className="flex items-center gap-4 border-b border-black pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={school.logoUrl} alt="" className="size-[18mm] shrink-0 object-contain" />
          <div className="flex-1 text-center">
            <h1 className="font-display text-[17pt] font-bold uppercase leading-tight tracking-wide" style={{ color: "#011a37" }}>
              {school.name}
            </h1>
            {school.address && <p className="text-[9.5pt]">{school.address}</p>}
            {school.phone && <p className="text-[9.5pt]">Phone: {school.phone}</p>}
          </div>
          <div className="w-[18mm] shrink-0" />
        </header>
        <div className="my-2 flex items-end justify-between">
          <h2 className="text-[13pt] font-bold tracking-wide">{title}</h2>
          <p className="text-[10pt]">{subtitle}</p>
        </div>
        <TimetableGrid refSlots={refSlots} days={days} cells={cells} print emptyLabel="" />
        {footer && <p className="mt-2 text-[8.5pt]">{footer}</p>}
        <p className="mt-3 text-center text-[8pt]">This is a computer-generated timetable</p>
      </article>
    </div>
  );
}
