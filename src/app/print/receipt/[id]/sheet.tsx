"use client";
import { useState } from "react";
import { Printer } from "lucide-react";
import { amountInWords, formatPaise } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { MODE_LABEL } from "@/features/fees/shared";
import type { ReceiptDetail } from "@/features/fees/queries";

export function PrintSheet({
  data,
  duplicate,
  initialSize,
  school,
}: {
  data: ReceiptDetail;
  duplicate: boolean;
  initialSize: "a4" | "a5";
  school: { name: string; address: string; phone: string | null; logoUrl: string };
}) {
  const [size, setSize] = useState<"a4" | "a5">(initialSize);
  const r = data.receipt;
  const cancelled = r.status === "cancelled";
  return (
    <div className="min-h-screen bg-neutral-100 p-4 print:bg-white print:p-0">
      <style>{`@page { size: ${size === "a4" ? "A4" : "A5"} portrait; margin: ${size === "a4" ? "14mm" : "9mm"}; } @media print { body { background: #fff !important; } }`}</style>

      <div className="mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="inline-flex rounded-lg border border-border bg-white p-1 text-sm shadow-sm">
          {(["a4", "a5"] as const).map((s) => (
            <button key={s} type="button" onClick={() => setSize(s)} className={`rounded-md px-3 py-1.5 ${size === s ? "bg-navy-900 font-medium text-gold-400" : "text-navy-800 hover:bg-navy-50"}`}>
              {s.toUpperCase()}
            </button>
          ))}
        </div>
        <p className="text-xs text-muted">Choose “Save as PDF” in the print window to get a PDF file.</p>
        <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-lg bg-navy-700 px-4 text-sm font-medium text-white shadow-sm hover:bg-navy-800">
          <Printer className="size-4" /> Print / Save PDF
        </button>
      </div>

      <article
        className="relative mx-auto bg-white text-black shadow-md print:shadow-none"
        style={{ width: size === "a4" ? "210mm" : "148mm", minHeight: size === "a4" ? "140mm" : "100mm", padding: size === "a4" ? "14mm" : "9mm", fontSize: size === "a4" ? "11pt" : "9.5pt" }}
      >
        {cancelled && (
          <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
            <span className="-rotate-12 rounded-xl border-8 border-red-600/40 px-8 py-2 text-6xl font-black tracking-widest text-red-600/40">CANCELLED</span>
          </div>
        )}
        {/* header */}
        <header className="flex items-center gap-4 border-b-2 border-black pb-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={school.logoUrl} alt="" style={{ width: size === "a4" ? "22mm" : "17mm", height: size === "a4" ? "22mm" : "17mm" }} className="object-contain" />
          <div className="flex-1 text-center">
            <h1 className="font-bold uppercase leading-tight" style={{ fontSize: size === "a4" ? "17pt" : "13pt" }}>{school.name}</h1>
            {school.address && <p className="mt-0.5">{school.address}</p>}
            {school.phone && <p>Phone: {school.phone}</p>}
          </div>
          <div className="w-[22mm]" />
        </header>

        <div className="my-3 flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-wide">FEE RECEIPT</h2>
          {duplicate ? <span className="rounded border-2 border-black px-2 py-0.5 text-sm font-bold uppercase">Duplicate copy</span> : <span className="text-sm font-semibold">Original</span>}
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          <div>
            <dt className="inline text-neutral-600">Receipt no: </dt>
            <dd className="inline font-bold">{r.receiptNo}</dd>
          </div>
          <div className="text-right">
            <dt className="inline text-neutral-600">Date: </dt>
            <dd className="inline font-semibold">{formatDate(r.date)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="inline text-neutral-600">{data.student ? "Student: " : "Received from: "}</dt>
            <dd className="inline font-semibold">{r.studentName}</dd>
          </div>
          {data.student && (
            <>
              <div>
                <dt className="inline text-neutral-600">Admission no: </dt>
                <dd className="inline font-semibold">{data.student.adm}</dd>
              </div>
              <div className="text-right">
                <dt className="inline text-neutral-600">Class: </dt>
                <dd className="inline font-semibold">
                  {data.student.className ?? "—"} {data.student.section ? `– ${data.student.section}` : ""}
                </dd>
              </div>
            </>
          )}
        </dl>

        <table className="mt-4 w-full border-collapse">
          <thead>
            <tr className="border-y-2 border-black text-left">
              <th className="w-10 py-1.5">#</th>
              <th className="py-1.5">Particulars</th>
              <th className="py-1.5 text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((i, n) => (
              <tr key={n} className="border-b border-neutral-300">
                <td className="py-1.5">{n + 1}</td>
                <td className="py-1.5">{i.description}</td>
                <td className="py-1.5 text-right tabular-nums">{formatPaise(i.amount, { fixed: true }).replace("₹", "")}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-black font-bold">
              <td />
              <td className="py-2 text-right">Total</td>
              <td className="py-2 text-right tabular-nums">{formatPaise(r.total, { fixed: true })}</td>
            </tr>
          </tbody>
        </table>

        <p className="mt-2">
          <span className="text-neutral-600">Amount in words: </span>
          <span className="font-semibold">{amountInWords(r.total)}</span>
        </p>
        <p className="mt-1">
          <span className="text-neutral-600">Payment mode: </span>
          <span className="font-semibold">{MODE_LABEL[r.mode]}</span>
          {r.reference && (
            <>
              <span className="text-neutral-600"> · Reference: </span>
              <span className="font-semibold">{r.reference}</span>
            </>
          )}
        </p>
        {cancelled && <p className="mt-2 font-bold text-red-700">This receipt was cancelled{r.cancelReason ? `: ${r.cancelReason}` : ""}.</p>}

        <footer className="mt-10 flex items-end justify-between">
          <div>
            <p className="text-neutral-600">Collected by</p>
            <p className="font-semibold">{r.collectedBy}</p>
          </div>
          <div className="text-center">
            <div className="mb-1 h-8 w-44 border-b border-black" />
            <p className="text-sm">Authorised signature</p>
          </div>
        </footer>
        <p className="mt-4 text-center text-[8pt] text-neutral-500">This is a computer-generated receipt.</p>
      </article>
    </div>
  );
}
