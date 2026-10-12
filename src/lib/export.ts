/**
 * Client-side export of table rows. CSV includes a UTF-8 BOM so Excel shows
 * Telugu correctly; .xlsx is generated with write-excel-file (loaded only
 * when someone actually exports).
 */
export type ExportCell = string | number | boolean | Date | null | undefined;
export type ExportSheet = { name: string; headers: string[]; rows: ExportCell[][]; widths?: number[] };
export type ExportFormat = "csv" | "xlsx";

function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function exportFileName(base: string, format: ExportFormat) {
  return `${base.replace(/[^\w-]+/g, "-").toLowerCase()}-${stamp()}.${format}`;
}

function csvEscape(v: ExportCell) {
  if (v === null || v === undefined) return "";
  const s = v instanceof Date ? v.toISOString().slice(0, 10) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function download(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function exportSheets(base: string, format: ExportFormat, sheets: ExportSheet[]) {
  const fileName = exportFileName(base, format);
  if (format === "csv") {
    const s = sheets[0];
    const lines = [s.headers, ...s.rows].map((r) => r.map(csvEscape).join(","));
    download(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), fileName);
    return fileName;
  }
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const data = sheets.map((s) => ({
    sheet: s.name.slice(0, 31),
    stickyRowsCount: 1,
    columns: s.headers.map((h, i) => ({ width: s.widths?.[i] ?? Math.min(40, Math.max(10, h.length + 4)) })),
    data: [
      s.headers.map((h) => ({ value: h, fontWeight: "bold" as const, backgroundColor: "#DDE6F3" })),
      ...s.rows.map((r) => r.map((v) => ({ value: v === null || v === undefined ? undefined : v }))),
    ],
  }));
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (writeXlsxFile as any)(data).toFile(fileName);
  return fileName;
}
