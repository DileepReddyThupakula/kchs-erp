import { amountInWords, formatPaise } from "@/lib/money";
import { formatDate } from "@/lib/utils";
import { MODE_LABEL } from "@/features/fees/shared";
import type { ReceiptDetail } from "@/features/fees/queries";

export type ReceiptSchool = { name: string; address: string; phone: string | null; udise: string | null; recognition: string | null; logoUrl: string };
export type ReceiptLayout = "two" | "a4" | "a5";

export const LAYOUTS: { id: ReceiptLayout; label: string; hint: string }[] = [
  { id: "two", label: "A4 · two copies", hint: "Parent copy + Office copy on one page" },
  { id: "a4", label: "A4 · single", hint: "One receipt on an A4 page" },
  { id: "a5", label: "A5", hint: "One receipt on an A5 page" },
];

const rupees = (p: number) => formatPaise(p, { fixed: true });
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

/**
 * THE fee receipt. Used on the receipt page, the print view and the Collect fee
 * success screen. Black ink only carries information (no colour-dependent
 * meaning); navy / gold are decoration that prints as grey.
 */
export function Receipt({
  data,
  school,
  duplicate,
  copyLabel,
  compact,
}: {
  data: ReceiptDetail;
  school: ReceiptSchool;
  /** Reprint: shows the DUPLICATE stamp. */
  duplicate: boolean;
  /** "Parent copy" / "Office copy" in the two-up layout. */
  copyLabel?: string;
  compact?: boolean;
}) {
  const r = data.receipt;
  const cancelled = r.status === "cancelled";
  const misc = r.kind === "misc";
  const st = data.student;
  const stamp = cancelled ? "CANCELLED" : duplicate ? "DUPLICATE" : "PAID";
  const id = [school.udise && `UDISE: ${school.udise}`, school.recognition && `Recognition No: ${school.recognition}`].filter(Boolean).join("  ·  ");
  const totalConcession = data.items.reduce((a, i) => a + i.concession, 0);
  const showConcession = totalConcession > 0;
  const text = compact ? "text-[8.5pt] leading-snug" : "text-[10.5pt] leading-snug";

  return (
    <article
      data-receipt
      className={`relative break-inside-avoid overflow-hidden bg-white text-black ${text}`}
      style={{ border: "2px solid #011a37", outline: "1px solid #b8962e", outlineOffset: "-5px", padding: compact ? "5mm 6mm" : "8mm 9mm" }}
    >
      {/* faint logo watermark */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={school.logoUrl} alt="" aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 object-contain" style={{ width: compact ? "55mm" : "80mm", opacity: 0.06 }} />

      {/* stamp */}
      <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
        {stamp === "PAID" ? (
          <span className="-rotate-12 border-2 border-black/25 px-4 font-bold tracking-[0.3em] text-black/25" style={{ fontSize: compact ? "18pt" : "26pt" }}>
            PAID
          </span>
        ) : (
          <span className="-rotate-[20deg] border-[3px] border-black/35 px-5 text-center font-black tracking-[0.25em] text-black/35" style={{ fontSize: compact ? "26pt" : "40pt", lineHeight: 1.1 }}>
            {stamp}
            {cancelled && r.cancelledAt && <span className="block text-[0.3em] font-bold tracking-widest">{formatDate(r.cancelledAt.slice(0, 10))}</span>}
          </span>
        )}
      </div>

      <div className="relative">
        {/* letterhead */}
        <header className="flex items-center gap-3 border-b border-black pb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={school.logoUrl} alt="" className="shrink-0 object-contain" style={{ width: compact ? "15mm" : "20mm", height: compact ? "15mm" : "20mm" }} />
          <div className="min-w-0 flex-1 text-center">
            <h1 className="font-display font-bold uppercase leading-tight tracking-wide" style={{ fontSize: compact ? "12.5pt" : "15pt", color: "#011a37" }}>
              {school.name}
            </h1>
            {school.address && <p>{school.address}</p>}
            {(school.phone || id) && (
              <p className="text-[0.92em]">
                {school.phone && <>Phone: {school.phone}</>}
                {school.phone && id && "  ·  "}
                {id}
              </p>
            )}
          </div>
          <div className="shrink-0" style={{ width: compact ? "15mm" : "20mm" }} />
        </header>

        {/* title row */}
        <div className="mt-2 flex items-end justify-between gap-2">
          <h2 className="font-bold tracking-[0.2em]" style={{ fontSize: compact ? "11pt" : "14pt" }}>
            FEE RECEIPT
            {misc && <span className="ml-2 rounded border border-black px-1.5 align-middle text-[0.6em] tracking-wide">Misc</span>}
          </h2>
          <div className="text-right">
            {copyLabel && <p className="font-bold uppercase tracking-wider">{copyLabel}</p>}
            {duplicate && <p className="text-[0.9em] font-semibold">Duplicate copy</p>}
          </div>
        </div>

        <dl className="mt-1.5 grid grid-cols-[1.5fr_1fr_1fr] gap-x-3 border-y border-black py-1">
          <Pair k="Receipt no" v={r.receiptNo} bold />
          <Pair k="Date" v={formatDate(r.date)} />
          <Pair k="Academic year" v={data.academicYear ?? "—"} />
        </dl>

        {/* student / payer */}
        <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5">
          {st ? (
            <>
              <Pair k="Student" v={st.name} bold />
              <Pair k="Admission no" v={st.adm} />
              <Pair k="Class" v={`${st.className ?? "—"}${st.section ? ` – ${st.section}` : ""}`} />
              <Pair k="Roll no" v={st.roll != null ? String(st.roll) : "—"} />
              <div className="col-span-2">
                <Pair k="Parent / Guardian" v={st.guardian ?? "—"} />
              </div>
            </>
          ) : (
            <div className="col-span-2">
              <Pair k="Received from" v={r.payerName ?? r.studentName} bold />
            </div>
          )}
        </dl>

        {/* fee table */}
        <table className="mt-2 w-full border-collapse">
          <thead>
            <tr className="border-y border-black text-left">
              <th className="w-7 py-0.5">#</th>
              <th className="py-0.5">{misc ? "Description" : "Fee"}</th>
              {showConcession && <th className="py-0.5 text-right">Concession (₹)</th>}
              <th className="py-0.5 text-right">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            {data.items.map((i, n) => (
              <tr key={n} className="border-b border-black/30">
                <td className="py-0.5">{n + 1}</td>
                <td className="py-0.5">
                  {i.description}
                  {misc && r.notes ? <span className="block text-[0.92em]">{r.notes}</span> : null}
                </td>
                {showConcession && <td className="py-0.5 text-right tabular-nums">{i.concession ? rupees(i.concession).replace("₹", "") : "—"}</td>}
                <td className="py-0.5 text-right tabular-nums">{rupees(i.amount).replace("₹", "")}</td>
              </tr>
            ))}
            <tr className="border-y-2 border-black font-bold">
              <td colSpan={showConcession ? 3 : 2} className="py-1 text-right">
                Total paid
              </td>
              <td className="py-1 text-right tabular-nums">{rupees(r.total)}</td>
            </tr>
          </tbody>
        </table>
        <p className="mt-1">
          <span>Amount in words: </span>
          <span className="font-semibold">{amountInWords(r.total)}</span>
        </p>
        {data.balanceAfter != null && (
          <p className="mt-0.5">
            <span>Balance still due after this payment: </span>
            <span className="font-bold tabular-nums">{rupees(data.balanceAfter)}</span>
          </p>
        )}

        {/* payment */}
        <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-0.5 border-t border-black pt-1">
          <Pair k="Payment mode" v={MODE_LABEL[r.mode]} />
          {r.reference ? <Pair k="Reference" v={r.reference} /> : <span />}
          <Pair k="Collected by" v={r.collectedBy} />
          <Pair k="Date & time" v={`${formatDate(r.date)}, ${timeOf(r.createdAt)}`} />
        </dl>
        {cancelled && (
          <p className="mt-1 font-bold">
            Cancelled{r.cancelledAt ? ` on ${formatDate(r.cancelledAt.slice(0, 10))}` : ""}
            {r.cancelReason ? `: ${r.cancelReason}` : ""}
          </p>
        )}

        {/* signatures (left blank) */}
        <div className="flex items-end justify-between" style={{ marginTop: compact ? "9mm" : "14mm" }}>
          <div className="w-[42%] border-t border-black pt-0.5 text-center">Cashier</div>
          <div className="w-[42%] border-t border-black pt-0.5 text-center">Authorised signatory</div>
        </div>
        <p className="mt-2 text-center text-[0.8em]">This is a computer-generated receipt</p>
      </div>
    </article>
  );
}

function Pair({ k, v, bold }: { k: string; v: string; bold?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="inline whitespace-nowrap">{k}: </dt>
      <dd className={`inline ${bold ? "font-bold" : "font-semibold"}`}>{v}</dd>
    </div>
  );
}

/** The receipt laid out for a paper size. `two` repeats it with the copy labels. */
export function ReceiptSheet({ data, school, duplicate, layout }: { data: ReceiptDetail; school: ReceiptSchool; duplicate: boolean; layout: ReceiptLayout }) {
  if (layout === "two") {
    return (
      <div data-sheet="two" className="mx-auto bg-white" style={{ width: "182mm" }}>
        <Receipt data={data} school={school} duplicate={duplicate} copyLabel="Parent copy" compact />
        <div className="my-[3mm] border-t border-dashed border-black text-center text-[7pt] leading-none"><span className="relative -top-1.5 bg-white px-2">cut here</span></div>
        <Receipt data={data} school={school} duplicate={duplicate} copyLabel="Office copy" compact />
      </div>
    );
  }
  return (
    <div data-sheet={layout} className="mx-auto bg-white" style={{ width: layout === "a4" ? "182mm" : "130mm" }}>
      <Receipt data={data} school={school} duplicate={duplicate} compact={layout === "a5"} />
    </div>
  );
}
