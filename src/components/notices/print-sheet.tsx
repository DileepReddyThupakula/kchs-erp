"use client";
import { Printer } from "lucide-react";

type School = { name: string; address: string; phone: string | null; logoUrl: string };

/** A4 portrait page with the school letterhead (logo, name, address, phone) and a double border. */
export function LetterheadPage({ school, children }: { school: School; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-neutral-100 p-4 print:bg-white print:p-0">
      <style>{`@page { size: A4 portrait; margin: 12mm; } @media print { body { background: #fff !important; } tr { break-inside: avoid; } }`}</style>
      <div className="mx-auto mb-4 flex max-w-[186mm] items-center justify-between gap-2 print:hidden">
        <p className="text-xs text-muted">Choose “Save as PDF” in the print window to get a PDF file. Paper: A4.</p>
        <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-700 px-4 text-sm font-medium text-white shadow-sm hover:bg-navy-800">
          <Printer className="size-4" /> Print / Save PDF
        </button>
      </div>
      <div className="overflow-x-auto print:overflow-visible">
      <article className="mx-auto bg-white p-[10mm] text-black shadow-md print:shadow-none" style={{ width: "186mm", minHeight: "270mm", border: "2px solid #011a37", outline: "1px solid #b8962e", outlineOffset: "-5px" }}>
        <header className="flex items-center gap-4 border-b border-black pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={school.logoUrl} alt="" className="size-[20mm] shrink-0 object-contain" />
          <div className="flex-1 text-center">
            <h1 className="font-display text-[17pt] font-bold uppercase leading-tight tracking-wide" style={{ color: "#011a37" }}>
              {school.name}
            </h1>
            {school.address && <p className="text-[9.5pt]">{school.address}</p>}
            {school.phone && <p className="text-[9.5pt]">Phone: {school.phone}</p>}
          </div>
          <div className="w-[20mm] shrink-0" />
        </header>
        {children}
      </article>
      </div>
    </div>
  );
}

export function DiaryPrint({ school, sectionLabel, dateLong, classTeacher, lines }: { school: School; sectionLabel: string; dateLong: string; classTeacher: string | null; lines: { subject: string; body: string }[] }) {
  return (
    <LetterheadPage school={school}>
      <div className="my-3 flex items-end justify-between">
        <h2 className="text-[14pt] font-bold tracking-[0.2em]">DAILY DIARY</h2>
        <p className="text-[10.5pt]">
          <b>{sectionLabel}</b> · {dateLong}
        </p>
      </div>
      <table className="w-full border-collapse text-[10.5pt]">
        <thead>
          <tr>
            <th className="w-[38mm] border border-black px-2 py-1 text-left">Subject</th>
            <th className="border border-black px-2 py-1 text-left">Homework / remark</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="border border-black px-2 py-1.5 align-top font-semibold">{l.subject}</td>
              <td className="whitespace-pre-wrap border border-black px-2 py-1.5">{l.body}</td>
            </tr>
          ))}
          {lines.length === 0 && (
            <tr>
              <td colSpan={2} className="border border-black px-2 py-4 text-center">
                No diary entries for this day.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <div className="mt-10 flex items-end justify-between text-[10pt]">
        <div className="w-[60mm] border-t border-black pt-0.5 text-center">Class teacher{classTeacher ? `: ${classTeacher}` : ""}</div>
        <div className="w-[60mm] border-t border-black pt-0.5 text-center">Parent signature</div>
      </div>
      <p className="mt-6 text-center text-[8pt]">This is a computer-generated diary</p>
    </LetterheadPage>
  );
}
