"use client";
import Link from "next/link";
import { useCallback, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { ArrowRightLeft, FileSpreadsheet, FileText, Loader2, RefreshCcw } from "lucide-react";
import type { RowAction } from "@/components/data-table/data-table";
import { StatusDialog } from "./[id]/client";
import { DataTable, type Column, type FilterDef, type ServerTable } from "@/components/data-table/data-table";
import { Modal } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, StatusChip } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { exportSheets, type ExportCell, type ExportFormat } from "@/lib/export";
import { logExport } from "@/features/audit/actions";
import { changeStudentsSection, studentsForExport } from "@/features/students/actions";
import { GROUP_LABEL, maskId, orderDefinitions, STATUS_LABEL, TELUGU_NAME_KEYS } from "@/features/students/fields";
import type { StudentRow, SectionOption } from "@/features/students/queries";
import type { StudentFieldDefinition } from "@/types/database";
import { formatDate } from "@/lib/utils";

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(-2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return <span className="grid size-8 shrink-0 place-items-center rounded-full bg-navy-100 text-xs font-semibold text-navy-700">{initials}</span>;
}

const classLabel = (r: StudentRow) => (r.className ? `${r.className} – ${r.section}` : "Not enrolled");
const father = (r: StudentRow) => r.guardians.find((g) => g.relation === "father");
const docsMissing = (r: StudentRow) => r.missingDocsCount ?? r.missingDocs?.length ?? 0;
const govMissing = (r: StudentRow) => r.missingGovCount ?? r.missingGov?.length ?? 0;
const mother = (r: StudentRow) => r.guardians.find((g) => g.relation === "mother");

/** Search / filter / sort / page state lives in the URL (so it survives a reload and can be shared). */
export const STUDENT_FILTER_KEYS = ["class", "section", "status", "docs", "gov", "enrol"] as const;
const PAGE_SIZES = [25, 50, 100, 250];

export function StudentsTable({
  rows,
  total,
  mode,
  sections,
  definitions = [],
  yearName,
  toolbar,
  canEdit = false,
  canChangeStatus = false,
  initialSection,
}: {
  /** ONE page of students (the database did the searching, filtering, sorting and paging). */
  rows: StudentRow[];
  /** How many students match the search and filters in all. */
  total: number;
  /** manage = Admin / student_records (all students); mine = own sections only */
  mode: "manage" | "mine";
  sections: SectionOption[];
  definitions?: StudentFieldDefinition[];
  yearName: string;
  toolbar?: React.ReactNode;
  /** Admin / student_records (the server re-checks). */
  canEdit?: boolean;
  /** Admin only. */
  canChangeStatus?: boolean;
  /** Kept for callers; a section chosen in the URL (?section=) is applied by the page. */
  initialSection?: string;
}) {
  const manage = mode === "manage";
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [exportRows, setExportRows] = useState<{ rows: StudentRow[]; info: Record<string, unknown> } | null>(null);
  const [moveRows, setMoveRows] = useState<{ rows: StudentRow[]; clear: () => void } | null>(null);
  const [statusFor, setStatusFor] = useState<StudentRow | null>(null);
  const studentActions = (r: StudentRow): RowAction[] => [
    { id: "view", kind: "view", label: "View", href: `/students/${r.id}` },
    ...(canEdit ? ([{ id: "edit", kind: "edit", label: "Edit", href: `/students/${r.id}/edit` }] satisfies RowAction[]) : []),
    ...(canChangeStatus ? ([{ id: "status", kind: "menu", label: "Change status", icon: RefreshCcw, onClick: () => setStatusFor(r) }] satisfies RowAction[]) : []),
  ];
  const classes = useMemo(() => [...new Map(sections.map((s) => [s.classId, { id: s.classId, name: s.className, order: s.classOrder }])).values()].sort((a, b) => a.order - b.order), [sections]);

  const columns: Column<StudentRow>[] = [
    {
      id: "name",
      header: "Student",
      hideable: false,
      pinned: "left",
      cell: (r) => (
        <Link href={`/students/${r.id}`} className="flex items-center gap-2.5 font-medium text-navy-900 hover:underline">
          <Avatar name={r.full_name} />
          <span className="whitespace-nowrap">{r.full_name}</span>
        </Link>
      ),
      sortValue: (r) => r.full_name,
    },
    { id: "adm", header: "Adm no", cell: (r) => <span className="font-mono text-xs">{r.admission_no}</span>, sortValue: (r) => r.admission_no },
    { id: "class", header: "Class", cell: (r) => (r.className ? classLabel(r) : <span className="text-muted">Not enrolled</span>), sortValue: (r) => r.classOrder * 100 + (r.section?.charCodeAt(0) ?? 0), exportValue: (r) => classLabel(r), className: "whitespace-nowrap" },
    { id: "roll", header: "Roll", align: "right", cell: (r) => r.rollNo ?? "—", sortValue: (r) => r.rollNo ?? 9999, exportValue: (r) => r.rollNo },
    { id: "gender", header: "Gender", cell: (r) => <span className="capitalize">{r.gender}</span>, sortValue: (r) => r.gender, defaultHidden: true },
    { id: "dob", header: "Date of birth", cell: (r) => formatDate(r.date_of_birth), sortValue: (r) => r.date_of_birth, defaultHidden: manage },
    {
      id: "guardian",
      header: "Parent / guardian",
      cell: (r) => r.guardians[0] ? (<span>{r.guardians[0].name} <span className="text-xs capitalize text-muted">({r.guardians[0].relation})</span></span>) : <span className="text-muted">—</span>,
      sortValue: (r) => r.guardians[0]?.name ?? "",
    },
    { id: "phone", className: "whitespace-nowrap", header: "Phone", cell: (r) => r.primaryPhone ? <a href={`tel:${r.primaryPhone}`} className="tabular-nums text-navy-700 hover:underline">{r.primaryPhone}</a> : "—", sortValue: (r) => r.primaryPhone ?? "" },
    { id: "address", header: "Address", cell: (r) => <span className="line-clamp-1 max-w-56">{r.address ?? "—"}</span>, sortValue: (r) => r.address ?? "", defaultHidden: manage },
  ];
  if (manage) {
    columns.push(
      { id: "status", header: "Status", cell: (r) => <StatusChip status={r.status} label={STATUS_LABEL[r.status]} />, sortValue: (r) => r.status },
      {
        id: "docs",
        header: "Documents",
        cell: (r) => (docsMissing(r) ? <Badge tone="warning">{docsMissing(r)} missing</Badge> : <Badge tone="success">Complete</Badge>),
        sortValue: (r) => docsMissing(r),
        exportValue: (r) => r.missingDocs?.join(", ") || "Complete",
      },
      {
        id: "gov",
        header: "Govt. fields",
        cell: (r) => (govMissing(r) ? <Badge tone="warning">{govMissing(r)} missing</Badge> : <Badge tone="success">Complete</Badge>),
        sortValue: (r) => govMissing(r),
        exportValue: (r) => r.missingGov?.join(", ") || "Complete",
      },
      { id: "aadhaar", header: "Aadhaar", cell: (r) => <span className="font-mono text-xs">{maskId(r.masked?.aadhaar_no) || "—"}</span>, exportValue: (r) => maskId(r.masked?.aadhaar_no), defaultHidden: true },
    );
  }

  const filters: FilterDef<StudentRow>[] = [
    { id: "class", label: "Class", options: classes.map((c) => ({ value: c.id, label: c.name })) },
    { id: "section", label: "Section", options: sections.map((s) => ({ value: s.id, label: s.label })) },
  ];
  if (manage) {
    filters.push(
      { id: "status", label: "Status", options: Object.entries(STATUS_LABEL).map(([value, label]) => ({ value, label })) },
      { id: "docs", label: "Documents", options: [{ value: "missing", label: "Missing documents" }, { value: "complete", label: "Complete" }] },
      { id: "gov", label: "Govt. fields", options: [{ value: "missing", label: "Missing required fields" }, { value: "complete", label: "Complete" }] },
      { id: "enrol", label: "Enrolment", options: [{ value: "none", label: `Not enrolled in ${yearName}` }] },
    );
  }

  // ---- server-side table state, kept in the URL
  const current = {
    q: sp.get("q") ?? "",
    filters: Object.fromEntries(
      STUDENT_FILTER_KEYS.filter((k) => manage || k === "class" || k === "section").map((k) => {
        const v = sp.get(k) ?? (k === "status" ? "active" : "");
        return [k, k === "status" && v === "all" ? "" : v];
      }),
    ) as Record<string, string>,
    sortId: sp.get("sort") ?? "name",
    dir: (sp.get("dir") === "desc" ? "desc" : "asc") as "asc" | "desc",
    page: Math.max(0, (Number(sp.get("page")) || 1) - 1),
    size: PAGE_SIZES.includes(Number(sp.get("size"))) ? Number(sp.get("size")) : 25,
  };
  const push = useCallback(
    (change: { page?: number; pageSize?: number; query?: string; filters?: Record<string, string>; sort?: { id: string; dir: "asc" | "desc" } | null }) => {
      const u = new URLSearchParams(sp.toString());
      if (change.query !== undefined) change.query ? u.set("q", change.query) : u.delete("q");
      if (change.filters) {
        for (const k of STUDENT_FILTER_KEYS) {
          if (!manage && k !== "class" && k !== "section") continue;
          const v = change.filters[k] ?? ""; // a filter left out (e.g. "Clear all") is cleared
          if (k === "status") v ? (v === "active" ? u.delete("status") : u.set("status", v)) : u.set("status", "all");
          else v ? u.set(k, v) : u.delete(k);
        }
      }
      if (change.sort !== undefined) {
        if (change.sort && !(change.sort.id === "name" && change.sort.dir === "asc")) {
          u.set("sort", change.sort.id);
          u.set("dir", change.sort.dir);
        } else {
          u.delete("sort");
          u.delete("dir");
        }
      }
      if (change.pageSize !== undefined) change.pageSize === 25 ? u.delete("size") : u.set("size", String(change.pageSize));
      if (change.page !== undefined) change.page > 0 ? u.set("page", String(change.page + 1)) : u.delete("page");
      const qs = u.toString();
      startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
    },
    [sp, pathname, router],
  );
  const server: ServerTable = {
    total,
    page: current.page,
    pageSize: current.size,
    query: current.q,
    filters: current.filters,
    sort: { id: current.sortId === "adm" ? "adm" : current.sortId, dir: current.dir },
    sortable: ["name", "adm", "class", "dob", "status"],
    pending,
    onChange: push,
  };
  /** The same search and filters, as the database function takes them (for "export everything that matches"). */
  const exportParams = {
    q: current.q || undefined,
    classId: current.filters.class || undefined,
    sectionId: current.filters.section || undefined,
    status: manage ? current.filters.status || undefined : undefined,
    docs: current.filters.docs || undefined,
    gov: current.filters.gov || undefined,
    enrol: current.filters.enrol || undefined,
    sort: current.sortId,
    dir: current.dir,
  };
  async function openExport(selected: StudentRow[], info: { selectedOnly: boolean }) {
    const t = toast.loading(info.selectedOnly ? "Collecting the selected students…" : "Collecting every matching student…");
    const r = await studentsForExport(info.selectedOnly ? { ids: selected.map((x) => x.id) } : exportParams, manage ? "all" : "mine");
    toast.dismiss(t);
    if (r.error || !r.rows) return toast.error(r.error ?? "Could not collect the students.");
    setExportRows({ rows: r.rows, info: info.selectedOnly ? { selectedOnly: true } : { filteredAll: true, search: current.q || undefined, filters: current.filters } });
  }

  return (
    <>
      <DataTable
        id={manage ? "students" : "my-students"}
        rowActions={studentActions}
        rowHref={(r) => `/students/${r.id}`}
        rowLabel={(r) => r.full_name}
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        searchText={() => ""}
        searchPlaceholder="Search name, admission no, parent, phone…"
        filters={filters}
        server={server}
        selectable
        bulkActions={(sel, clear) => (
          <>
            {manage && (
              <Button size="sm" variant="accent" onClick={() => setMoveRows({ rows: sel, clear })}>
                <ArrowRightLeft className="size-3.5" /> Change section
              </Button>
            )}
            <Button size="sm" variant="secondary" onClick={() => void openExport(sel, { selectedOnly: true })}>
              <FileSpreadsheet className="size-3.5" /> Export selected
            </Button>
          </>
        )}
        customExport={(r, info) => void openExport(r, info)}
        emptyTitle={manage ? "No students yet" : "No students in your sections"}
        emptyMessage={manage ? "Add students one by one, or import them from Excel." : "Students appear here once they're enrolled in the sections you teach."}
        toolbar={toolbar}
      />
      {exportRows && <ExportDialog rows={exportRows.rows} info={exportRows.info} manage={manage} definitions={definitions} onClose={() => setExportRows(null)} />}
      {statusFor && <StatusDialog id={statusFor.id} status={statusFor.status} name={statusFor.full_name} open onClose={() => setStatusFor(null)} />}
      {moveRows && <ChangeSectionDialog rows={moveRows.rows} sections={sections} onClose={() => setMoveRows(null)} onDone={moveRows.clear} />}
    </>
  );
}

// ------------------------------------------------------------------ export with field picker
type FieldOpt = { id: string; label: string; group: string; value: (r: StudentRow) => ExportCell; defaultOn?: boolean };

export function exportFields(manage: boolean, definitions: StudentFieldDefinition[]): FieldOpt[] {
  const base: FieldOpt[] = [
    { id: "adm", label: "Admission no", group: "Basic", value: (r) => r.admission_no, defaultOn: true },
    { id: "name", label: "Student name", group: "Basic", value: (r) => r.full_name, defaultOn: true },
    { id: "gender", label: "Gender", group: "Basic", value: (r) => r.gender, defaultOn: true },
    { id: "dob", label: "Date of birth", group: "Basic", value: (r) => r.date_of_birth },
    { id: "class", label: "Class", group: "Class", value: (r) => r.className, defaultOn: true },
    { id: "section", label: "Section", group: "Class", value: (r) => r.section, defaultOn: true },
    { id: "roll", label: "Roll no", group: "Class", value: (r) => r.rollNo, defaultOn: true },
    { id: "father", label: "Father name", group: "Family", value: (r) => father(r)?.name },
    { id: "father_phone", label: "Father mobile", group: "Family", value: (r) => father(r)?.phone },
    { id: "mother", label: "Mother name", group: "Family", value: (r) => mother(r)?.name },
    { id: "mother_phone", label: "Mother mobile", group: "Family", value: (r) => mother(r)?.phone },
    { id: "phone", label: "Primary mobile", group: "Family", value: (r) => r.primaryPhone, defaultOn: true },
    { id: "address", label: "Address", group: "Address", value: (r) => r.address },
    { id: "village", label: "Village / town", group: "Address", value: (r) => r.village_town },
    { id: "pincode", label: "Pincode", group: "Address", value: (r) => r.pincode },
  ];
  if (!manage) return base;
  return [
    ...base,
    { id: "admission_date", label: "Admission date", group: "Basic", value: (r) => r.admission_date },
    { id: "status", label: "Status", group: "Basic", value: (r) => STATUS_LABEL[r.status] },
    { id: "missing_docs", label: "Missing documents", group: "Checks", value: (r) => r.missingDocs?.join(", ") || "" },
    { id: "missing_gov", label: "Missing govt. fields", group: "Checks", value: (r) => r.missingGov?.join(", ") || "" },
    ...orderDefinitions(definitions).map<FieldOpt>((d) => ({
      id: `def:${d.key}`,
      label: d.sensitive ? `${d.label} (masked)` : d.label,
      group: d.sensitive ? "IDs (always masked)" : (TELUGU_NAME_KEYS as readonly string[]).includes(d.key) ? "Telugu names" : GROUP_LABEL[d.field_group],
      value: (r) => {
        if (d.sensitive) return maskId(r.masked?.[d.key]);
        const v = r.details?.[d.key];
        return Array.isArray(v) ? v.join("; ") : typeof v === "boolean" ? (v ? "Yes" : "No") : (v as ExportCell);
      },
    })),
  ];
}

function ExportDialog({ rows, info, manage, definitions, onClose }: { rows: StudentRow[]; info: Record<string, unknown>; manage: boolean; definitions: StudentFieldDefinition[]; onClose: () => void }) {
  const fields = useMemo(() => exportFields(manage, definitions), [manage, definitions]);
  const [on, setOn] = useState<Set<string>>(() => new Set(fields.filter((f) => f.defaultOn).map((f) => f.id)));
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const groups = [...new Set(fields.map((f) => f.group))];
  const toggle = (id: string) =>
    setOn((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function run(format: ExportFormat) {
    const chosen = fields.filter((f) => on.has(f.id));
    if (!chosen.length) return toast.error("Pick at least one field.");
    setBusy(format);
    try {
      await exportSheets("students", format, [{ name: "Students", headers: chosen.map((f) => f.label), rows: rows.map((r) => chosen.map((f) => f.value(r) ?? null)) }]);
      await logExport("students", rows.length, format, { ...info, fields: chosen.map((f) => f.label) });
      toast.success(`Exported ${rows.length} student(s).`);
      onClose();
    } catch {
      toast.error("Export failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Export ${rows.length} student${rows.length === 1 ? "" : "s"}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => run("csv")} disabled={!!busy}>
            {busy === "csv" ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />} CSV
          </Button>
          <Button onClick={() => run("xlsx")} disabled={!!busy}>
            {busy === "xlsx" ? <Loader2 className="size-4 animate-spin" /> : <FileSpreadsheet className="size-4" />} Excel
          </Button>
        </>
      }
    >
      <p className="mb-3">
        Pick the fields to include. ID numbers are always masked here{manage ? "; full IDs are only in the Admin government export" : ""}. Every export is recorded in the audit log.
      </p>
      <div className="max-h-[50vh] space-y-3 overflow-y-auto pr-1">
        {groups.map((g) => (
          <fieldset key={g}>
            <legend className="mb-1 flex w-full items-center justify-between text-xs font-semibold uppercase tracking-wide text-navy-800">
              {g}
              <button
                type="button"
                className="text-[11px] font-medium normal-case text-navy-600 hover:underline"
                onClick={() => setOn((s) => {
                  const ids = fields.filter((f) => f.group === g).map((f) => f.id);
                  const all = ids.every((i) => s.has(i));
                  const n = new Set(s);
                  ids.forEach((i) => (all ? n.delete(i) : n.add(i)));
                  return n;
                })}
              >
                Toggle all
              </button>
            </legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {fields.filter((f) => f.group === g).map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-sm text-foreground">
                  <input type="checkbox" checked={on.has(f.id)} onChange={() => toggle(f.id)} className="accent-navy-700" />
                  {f.label}
                </label>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
    </Modal>
  );
}

function ChangeSectionDialog({ rows, sections, onClose, onDone }: { rows: StudentRow[]; sections: SectionOption[]; onClose: () => void; onDone: () => void }) {
  const router = useRouter();
  const [sectionId, setSectionId] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Change section for ${rows.length} student(s)`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            disabled={!sectionId || busy}
            onClick={async () => {
              setBusy(true);
              const res = await changeStudentsSection(rows.map((r) => r.id), sectionId);
              setBusy(false);
              if (res.error) return toast.error(res.error);
              toast.success(res.message);
              onDone();
              onClose();
              router.refresh();
            }}
          >
            {busy && <Loader2 className="size-4 animate-spin" />} Move students
          </Button>
        </>
      }
    >
      <p className="mb-3">Their enrolment for this academic year moves to the chosen section. Roll numbers are cleared so you can renumber.</p>
      <Select aria-label="New section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
        <option value="">Pick a section</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label}
          </option>
        ))}
      </Select>
    </Modal>
  );
}
