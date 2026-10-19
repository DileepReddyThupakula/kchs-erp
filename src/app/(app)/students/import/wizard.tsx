"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Loader2, RotateCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Badge, Card, StatusChip } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { exportSheets, type ExportCell } from "@/lib/export";
import { logExport } from "@/features/audit/actions";
import { commitImport, validateImport, type ImportCheck } from "@/features/students/actions";
import { CORE_COLUMNS, orderDefinitions, TELUGU_NAME_KEYS, toIsoDate, type RawRow } from "@/features/students/fields";
import type { StudentFieldDefinition } from "@/types/database";

type Result = { rowNo: number; admissionNo: string; outcome: "imported" | "skipped" | "failed"; message?: string };
type TemplateColumn = { key: string; label: string; required: boolean; allowed: string; gov?: boolean };

export function templateColumns(defs: StudentFieldDefinition[]): TemplateColumn[] {
  return [
    ...CORE_COLUMNS.map((c) => ({ key: c.key, label: c.label, required: c.required, allowed: c.help })),
    ...orderDefinitions(defs).map((d) => ({
      key: d.key,
      label: d.label,
      required: false,
      gov: d.required_for_gov,
      allowed:
        d.field_type === "select"
          ? d.options!.join(" / ")
          : d.field_type === "multiselect"
            ? `One or more, separated by ; : ${d.options!.join("; ")}`
            : d.field_type === "boolean"
              ? "yes / no"
              : d.field_type === "date"
                ? "Excel date or YYYY-MM-DD"
                : d.field_type === "number"
                  ? "Number"
                  : d.sensitive
                    ? `${d.help ?? ""} (stored encrypted)`.trim()
                    : (TELUGU_NAME_KEYS as readonly string[]).includes(d.key)
                      ? "Telugu spelling exactly as it should print (typed by a Telugu speaker; the system never translates it)"
                      : (d.help ?? ""),
    })),
  ];
}

export function ImportWizard({
  yearName,
  sections,
  definitions,
}: {
  yearName: string;
  sections: { className: string; section: string }[];
  definitions: StudentFieldDefinition[];
}) {
  const cols = useMemo(() => templateColumns(definitions), [definitions]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rows, setRows] = useState<RawRow[] | null>(null);
  const [checks, setChecks] = useState<ImportCheck[] | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [busy, setBusy] = useState<"read" | "check" | "import" | null>(null);

  async function downloadTemplate() {
    await exportSheets("student-import-template", "xlsx", [
      { name: "Students", headers: cols.map((c) => c.key), rows: [], widths: cols.map((c) => Math.max(14, c.key.length + 2)) },
      {
        name: "Allowed values",
        headers: ["Column", "What it is", "Required", "Allowed values / format"],
        rows: [
          ...cols.map<ExportCell[]>((c) => [c.key, c.label, c.required ? "Yes" : c.gov ? "Needed for government return" : "No", c.allowed]),
          ["", "", "", ""],
          ["class + section", `Sections in ${yearName}`, "", sections.map((s) => `${s.className} / ${s.section}`).join(", ")],
        ],
        widths: [24, 32, 26, 90],
      },
    ]);
  }

  async function onFile(file: File) {
    setBusy("read");
    setChecks(null);
    setResults(null);
    try {
      const { readSheet } = await import("read-excel-file/browser");
      let data: unknown[][];
      try {
        data = (await readSheet(file, "Students")) as unknown[][];
      } catch {
        data = (await readSheet(file)) as unknown[][];
      }
      if (data.length < 2) throw new Error("The sheet has no student rows under the header.");
      const byLabel = new Map<string, string>(cols.flatMap((c) => [[c.key.toLowerCase(), c.key] as [string, string], [c.label.toLowerCase(), c.key] as [string, string]]));
      const header = (data[0] as unknown[]).map((h) => byLabel.get(String(h ?? "").trim().toLowerCase().replace(/\s*\*$/, "")) ?? null);
      if (!header.includes("admission_no") || !header.includes("full_name")) {
        throw new Error("This doesn't look like the template: the admission_no and full_name columns are missing.");
      }
      const parsed: RawRow[] = data
        .slice(1)
        .map((r) => {
          const o: RawRow = {};
          (r as unknown[]).forEach((v, i) => {
            const k = header[i];
            if (!k || v === null || v === undefined || v === "") return;
            o[k] = v instanceof Date ? toIsoDate(v) : typeof v === "boolean" ? v : String(v);
          });
          return o;
        })
        .filter((o) => Object.keys(o).length > 0);
      setRows(parsed);
      setFileName(file.name);
      setBusy("check");
      const res = await validateImport(parsed);
      if (res.error) throw new Error(res.error);
      setChecks(res.rows ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read the file.");
      setRows(null);
      setFileName(null);
    } finally {
      setBusy(null);
    }
  }

  async function downloadErrors() {
    if (!rows || !checks) return;
    const bad = checks.filter((c) => c.status === "error");
    await exportSheets("student-import-errors", "xlsx", [
      {
        name: "Students",
        headers: [...cols.map((c) => c.key), "errors"],
        rows: bad.map((c) => [...cols.map((col) => (rows[c.rowNo - 2]?.[col.key] as ExportCell) ?? null), c.errors.join("; ")]),
      },
    ]);
    await logExport("students.import-errors", bad.length, "xlsx", { file: fileName });
  }

  async function doImport() {
    if (!rows) return;
    setBusy("import");
    const res = await commitImport(rows);
    setBusy(null);
    if (res.error) return toast.error(res.error);
    setResults(res.results ?? []);
    toast.success(`Imported ${res.results?.filter((r) => r.outcome === "imported").length ?? 0} student(s).`);
  }

  const counts = checks && {
    ok: checks.filter((c) => c.status === "ok").length,
    error: checks.filter((c) => c.status === "error").length,
    exists: checks.filter((c) => c.status === "exists").length,
  };

  const checkColumns: Column<ImportCheck>[] = [
    { id: "row", header: "Row", align: "right", cell: (r) => <span className="tabular-nums text-muted">{r.rowNo}</span>, sortValue: (r) => r.rowNo },
    { id: "adm", header: "Admission no", cell: (r) => <span className="font-mono text-xs">{r.admissionNo || "—"}</span>, sortValue: (r) => r.admissionNo },
    { id: "name", header: "Name", cell: (r) => r.name || "—", sortValue: (r) => r.name },
    {
      id: "status",
      header: "Check",
      cell: (r) =>
        r.status === "ok" ? (
          <StatusChip status="active" label="Ready" />
        ) : r.status === "exists" ? (
          <StatusChip status="closed" label="Already exists, will skip" />
        ) : (
          <StatusChip status="left" label={`${r.errors.length} error(s)`} />
        ),
      sortValue: (r) => r.status,
    },
    {
      id: "errors",
      header: "Problems",
      cell: (r) =>
        r.errors.length ? (
          <ul className="list-inside list-disc text-xs text-red-700">
            {r.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : (
          <span className="text-muted">—</span>
        ),
      exportValue: (r) => r.errors.join("; "),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">Step 1</p>
          <h2 className="mt-1 font-semibold text-navy-900">Download the template</h2>
          <p className="mt-1 text-sm text-muted">
            One row per student in the “Students” sheet. The “Allowed values” sheet explains every column and lists the sections of {yearName}.
          </p>
          <Button variant="secondary" className="mt-3" onClick={downloadTemplate}>
            <Download className="size-4" /> Excel template
          </Button>
        </Card>
        <Card>
          <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">Step 2</p>
          <h2 className="mt-1 font-semibold text-navy-900">Upload the filled file</h2>
          <p className="mt-1 text-sm text-muted">Every row is checked first. Nothing is saved yet.</p>
          <label className={buttonClasses("primary", "md", "mt-3 cursor-pointer")}>
            {busy === "read" || busy === "check" ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}
            {busy === "read" ? "Reading…" : busy === "check" ? "Checking rows…" : "Choose .xlsx file"}
            <input
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="sr-only"
              disabled={!!busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
          </label>
          {fileName && <p className="mt-2 text-xs text-muted">File: {fileName}</p>}
        </Card>
      </div>

      {checks && !results && counts && (
        <Card>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gold-700">Step 3</p>
              <h2 className="mt-1 font-semibold text-navy-900">Check the preview</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="success">
                <CheckCircle2 className="size-3.5" /> {counts.ok} ready
              </Badge>
              {counts.exists > 0 && <Badge>{counts.exists} already exist (skipped)</Badge>}
              {counts.error > 0 && (
                <Badge tone="danger">
                  <AlertTriangle className="size-3.5" /> {counts.error} with errors
                </Badge>
              )}
            </div>
          </div>
          <DataTable
            id="import-preview"
            rows={checks}
            columns={checkColumns}
            getRowId={(r) => String(r.rowNo)}
            initialFilters={counts.error ? { status: "error" } : {}}
            filters={[
              {
                id: "status",
                label: "Check",
                options: [
                  { value: "ok", label: "Ready" },
                  { value: "error", label: "Errors" },
                  { value: "exists", label: "Already exists" },
                ],
                match: (r, v) => r.status === v,
              },
            ]}
            pageSize={50}
          />
          <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
            {counts.error > 0 && (
              <Button variant="secondary" onClick={downloadErrors}>
                <FileSpreadsheet className="size-4" /> Download error report
              </Button>
            )}
            <Button onClick={doImport} disabled={!counts.ok || busy === "import"} loading={busy === "import"}>
              {busy === "import" ? "Importing…" : `Import ${counts.ok} student${counts.ok === 1 ? "" : "s"}`}
            </Button>
          </div>
          {counts.error > 0 && (
            <p className="mt-2 text-right text-xs text-muted">Rows with errors are not imported. Fix them in the error report and upload it again.</p>
          )}
        </Card>
      )}

      {results && (
        <Card>
          <h2 className="mb-2 font-semibold text-navy-900">Import finished</h2>
          <div className="mb-3 flex flex-wrap gap-2">
            <Badge tone="success">{results.filter((r) => r.outcome === "imported").length} imported</Badge>
            <Badge>{results.filter((r) => r.outcome === "skipped").length} skipped (already existed)</Badge>
            <Badge tone={results.some((r) => r.outcome === "failed") ? "danger" : "neutral"}>{results.filter((r) => r.outcome === "failed").length} failed</Badge>
          </div>
          {results.some((r) => r.outcome === "failed") && (
            <ul className="mb-3 list-inside list-disc text-sm text-red-700">
              {results
                .filter((r) => r.outcome === "failed")
                .slice(0, 20)
                .map((r) => (
                  <li key={r.rowNo}>
                    Row {r.rowNo} ({r.admissionNo}): {r.message}
                  </li>
                ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            <Link href="/students" className={buttonClasses("primary")}>
              Go to students
            </Link>
            <Button
              variant="secondary"
              onClick={() => {
                setRows(null);
                setChecks(null);
                setResults(null);
                setFileName(null);
              }}
            >
              <RotateCcw className="size-4" /> Import another file
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
