"use client";
import { Printer } from "lucide-react";

/** A4 landscape report with the school letterhead (black on white). */
export function ReportPrintSheet({
  school,
  title,
  subtitle,
  headers,
  rows,
  note,
  compact,
  footer,
}: {
  school: { name: string; address: string; phone: string | null; logoUrl: string };
  title: string;
  subtitle: string;
  headers: string[];
  rows: (string | number)[][];
  note?: string;
  compact?: boolean;
  /** "Printed on … by … · Confidential - for school use": repeated at the bottom of every printed page */
  footer: string;
}) {
  return (
    <div className="min-h-screen bg-neutral-100 p-4 print:bg-white print:p-0">
      <style>{`@page { size: A4 landscape; margin: 10mm; } @media print { body { background: #fff !important; } thead { display: table-header-group; } tr { break-inside: avoid; } article { box-shadow: none !important; } .print-frame { width: 100%; border-collapse: collapse; } .print-frame > thead, .print-frame > tbody, .print-frame > tfoot { border: 0; } .print-frame > tfoot { display: table-footer-group; } .print-frame > tbody > tr, .print-frame > tfoot > tr { break-inside: auto; } }`}</style>
      <div className="mx-auto mb-4 flex max-w-[277mm] items-center justify-between gap-2 print:hidden">
        <p className="text-xs text-muted">Choose “Save as PDF” in the print window to get a PDF file. Paper: A4 landscape.</p>
        <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-700 px-4 text-sm font-medium text-white shadow-sm hover:bg-navy-800">
          <Printer className="size-4" /> Print / Save PDF
        </button>
      </div>
      <article className="mx-auto bg-white p-[8mm] text-black shadow-md print:shadow-none" style={{ width: "277mm", border: "2px solid #011a37", outline: "1px solid #b8962e", outlineOffset: "-5px" }}>
        <table className="print-frame">
          <tbody>
            <tr>
              <td className="p-0 align-top">
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
        <table className={`w-full border-collapse ${compact ? "text-[7.5pt]" : "text-[9pt]"}`}>
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="border border-black px-1 py-1 text-left font-semibold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri}>
                {r.map((c, ci) => (
                  <td key={ci} className={`border border-black px-1 py-0.5 ${typeof c === "number" || ci > 1 ? "text-center" : ""}`}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={headers.length} className="border border-black px-2 py-3 text-center">
                  Nothing to show.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {note && <p className="mt-2 text-[8.5pt]">{note}</p>}
        <p className="mt-3 text-center text-[8pt]">This is a computer-generated report</p>
              </td>
            </tr>
          </tbody>
          {/* repeated at the bottom of every printed page (a table footer repeats on each page, so it never overlaps the rows) */}
          <tfoot>
            <tr>
              <td className="p-0 pt-2">
                <p className="report-footer text-center text-[8pt] text-neutral-700" data-testid="print-footer">{footer}</p>
              </td>
            </tr>
          </tfoot>
        </table>
      </article>
    </div>
  );
}
