"use client";
import { useRouter } from "next/navigation";
import { runVoidAction } from "@/components/data-table/run-action";
import type { RowAction } from "@/components/data-table/data-table";
import Link from "next/link";
import { CalendarRange, Plus, Star, Trash2 } from "lucide-react";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { Drawer } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge, StatusChip } from "@/components/ui/card";
import { ActionForm, FormSection } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/form";
import { useDrawer } from "@/components/ui/use-drawer";
import { formatDate } from "@/lib/utils";
import { addHoliday, deleteHoliday, saveAcademicYear, setCurrentYear } from "@/features/setup/actions";
import type { AcademicYear, Holiday } from "@/types/database";

export type YearRow = AcademicYear & { holidayCount: number };

export function YearsTable({ rows, editable }: { rows: YearRow[]; editable: boolean }) {
  const drawer = useDrawer<YearRow>();
  const router = useRouter();
  const yearActions = (r: YearRow): RowAction[] => [
    { id: "view", kind: "view", label: "View", onClick: () => drawer.openView(r) },
    ...(editable ? ([{ id: "edit", kind: "edit", label: "Edit", onClick: () => drawer.openEdit(r) }] satisfies RowAction[]) : []),
    { id: "holidays", kind: "menu", label: "Holidays", icon: CalendarRange, href: `/setup/academic-years/${r.id}` },
    ...(editable && !r.is_current
      ? ([
          {
            id: "current",
            kind: "menu",
            label: "Make current year",
            icon: Star,
            confirm: { title: `Make ${r.name} the current year?`, message: "Pages across the ERP will open this year by default.", confirmLabel: "Make current", danger: false },
            onClick: () => runVoidAction(setCurrentYear, { id: r.id }, `${r.name} is now the current year.`, router.refresh),
          },
        ] satisfies RowAction[])
      : []),
  ];
  const columns: Column<YearRow>[] = [
    {
      id: "name",
      header: "Year",
      hideable: false,
      cell: (r) => (
        <Link href={`/setup/academic-years/${r.id}`} className="inline-flex items-center gap-2 font-medium text-navy-800 hover:underline">
          {r.name} {r.is_current && <StatusChip status="current" label="Current" />}
        </Link>
      ),
      sortValue: (r) => r.start_date,
      exportValue: (r) => r.name,
      className: "whitespace-nowrap",
      pinned: "left",
    },
    { id: "start", header: "Starts", cell: (r) => formatDate(r.start_date), sortValue: (r) => r.start_date, className: "whitespace-nowrap" },
    { id: "end", header: "Ends", cell: (r) => formatDate(r.end_date), sortValue: (r) => r.end_date, className: "whitespace-nowrap" },
    { id: "status", header: "Status", cell: (r) => <StatusChip status={r.status} />, sortValue: (r) => r.status },
    { id: "holidays", header: "Holidays", align: "right", cell: (r) => r.holidayCount, sortValue: (r) => r.holidayCount },
  ];
  return (
    <>
      <DataTable
        id="academic-years"
        rowActions={yearActions}
        onRowClick={(r) => drawer.openView(r)}
        rowLabel={(r) => r.name}
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        searchText={(r) => r.name}
        filters={[{ id: "status", label: "Status", options: ["planned", "active", "closed"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) })), match: (r, v) => r.status === v }]}
        exportName="academic-years"
        emptyMessage={editable ? "Add the first academic year. Its 2nd Saturdays become holidays automatically." : "The Admin hasn't set up an academic year yet."}
        toolbar={
          editable && (
            <Button onClick={drawer.openNew}>
              <Plus className="size-4" /> Add year
            </Button>
          )
        }
      />
      {(editable || drawer.readOnly) && (
        <Drawer open={drawer.open} onClose={drawer.close} title={drawer.item ? `${drawer.readOnly ? "Academic year" : "Edit"} ${drawer.item.name}` : "Add academic year"} description={drawer.item ? `${drawer.item.holidayCount} holidays` : "Every 2nd Saturday is added as a holiday automatically."}>
          <ActionForm key={`${drawer.item?.id ?? "new"}-${drawer.mode}`} action={saveAcademicYear} layout="drawer" submitLabel={drawer.item ? "Save year" : "Add year"} onCancel={drawer.close} onSuccess={drawer.close} readOnly={drawer.readOnly} onEditRequest={editable ? drawer.toEdit : undefined}>
            {(fe) => {
              const y = drawer.item;
              return (
                <>
                  {y && <input type="hidden" name="id" value={y.id} />}
                  <FormSection title="Academic year">
                    <Field label="Name" name="name" errors={fe.name} hint="e.g. 2027-28">
                      <Input id="name" name="name" defaultValue={y?.name ?? ""} required />
                    </Field>
                    <Field label="Status" name="status" errors={fe.status}>
                      <Select id="status" name="status" defaultValue={y?.status ?? "planned"}>
                        <option value="planned">Planned</option>
                        <option value="active">Active</option>
                        <option value="closed">Closed</option>
                      </Select>
                    </Field>
                    <Field label="Starts" name="start_date" errors={fe.start_date}>
                      <Input id="start_date" name="start_date" type="date" defaultValue={y?.start_date ?? ""} required />
                    </Field>
                    <Field label="Ends" name="end_date" errors={fe.end_date}>
                      <Input id="end_date" name="end_date" type="date" defaultValue={y?.end_date ?? ""} required />
                    </Field>
                  </FormSection>
                </>
              );
            }}
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}

export function HolidaysTable({ rows, editable, year }: { rows: Holiday[]; editable: boolean; year: AcademicYear }) {
  const drawer = useDrawer<null>();
  const router = useRouter();
  const weekday = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" });
  const month = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });
  const months = [...new Set(rows.map((r) => r.date.slice(0, 7)))].sort();
  const columns: Column<Holiday>[] = [
    { id: "date", header: "Date", hideable: false, cell: (r) => <span className="tabular-nums">{formatDate(r.date)}</span>, sortValue: (r) => r.date, className: "whitespace-nowrap", pinned: "left" },
    { id: "day", header: "Day", cell: (r) => weekday(r.date), exportValue: (r) => weekday(r.date) },
    { id: "name", header: "Holiday", cell: (r) => <span className="font-medium text-navy-900">{r.name}</span>, sortValue: (r) => r.name },
    { id: "kind", header: "Type", cell: (r) => (r.kind === "second_saturday" ? <Badge tone="gold">Auto · 2nd Saturday</Badge> : <StatusChip status="declared" label="Declared" />), sortValue: (r) => r.kind },
  ];
  return (
    <>
      <DataTable
        id="holidays"
        rowActions={
          editable
            ? (r) => [
                {
                  id: "remove",
                  kind: "menu",
                  label: "Remove holiday",
                  icon: Trash2,
                  tone: "danger",
                  confirm: { title: `Remove ${r.name}?`, message: `${formatDate(r.date)} will become a working day.`, confirmLabel: "Remove" },
                  onClick: () => runVoidAction(deleteHoliday, { id: r.id }, "Holiday removed.", router.refresh),
                },
              ]
            : undefined
        }
        rowLabel={(r) => `${r.name}, ${formatDate(r.date)}`}
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        searchText={(r) => `${r.name} ${r.date}`}
        filters={[
          { id: "kind", label: "Type", options: [{ value: "declared", label: "Declared" }, { value: "second_saturday", label: "2nd Saturday" }], match: (r, v) => r.kind === v },
          { id: "month", label: "Month", options: months.map((m) => ({ value: m, label: month(m + "-01") })), match: (r, v) => r.date.startsWith(v) },
        ]}
        pageSize={50}
        exportName={`holidays-${year.name}`}
        emptyMessage="Add holidays such as Sankranti or Dasara."
        toolbar={
          editable && (
            <Button onClick={drawer.openNew}>
              <Plus className="size-4" /> Add holiday
            </Button>
          )
        }
      />
      {editable && (
        <Drawer open={drawer.open} onClose={drawer.close} title="Add holiday" description={`Academic year ${year.name}`}>
          <ActionForm action={addHoliday} layout="drawer" submitLabel="Add holiday" onCancel={drawer.close} onSuccess={drawer.close}>
            {(fe) => (
              <FormSection title="Holiday">
                <input type="hidden" name="academic_year_id" value={year.id} />
                <Field label="Date" name="date" errors={fe.date}>
                  <Input id="date" name="date" type="date" min={year.start_date} max={year.end_date} required />
                </Field>
                <Field label="Name" name="name" errors={fe.name}>
                  <Input id="name" name="name" placeholder="e.g. Sankranti" required />
                </Field>
              </FormSection>
            )}
          </ActionForm>
        </Drawer>
      )}
    </>
  );
}
