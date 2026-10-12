"use client";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { Badge, StatusChip } from "@/components/ui/card";
import type { MyClassRow } from "@/features/my/queries";

export function MyClassesTable({ rows, yearName }: { rows: MyClassRow[]; yearName: string }) {
  const columns: Column<MyClassRow>[] = [
    {
      id: "class",
      header: "Class",
      hideable: false,
      cell: (r) => (
        <span className="inline-flex items-center gap-2 font-medium text-navy-900">
          {r.className} – {r.section}
          {r.isClassTeacher && <Badge tone="gold">Class teacher</Badge>}
        </span>
      ),
      sortValue: (r) => r.classOrder * 100 + r.section.charCodeAt(0),
      exportValue: (r) => `${r.className} ${r.section}`,
    },
    { id: "medium", header: "Medium", cell: (r) => (r.medium ? <StatusChip status="declared" label={r.medium} /> : <span className="text-muted">Not set</span>), sortValue: (r) => r.medium ?? "" },
    {
      id: "subjects",
      header: "Subjects I teach",
      cell: (r) =>
        r.subjects.length ? (
          <div className="flex flex-wrap gap-1">
            {r.subjects.map((s) => (
              <Badge key={s} tone="info">
                {s}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-muted">Class teacher only</span>
        ),
      exportValue: (r) => r.subjects.join(", "),
    },
    { id: "role", header: "My role", cell: (r) => (r.isClassTeacher ? "Class teacher" : "Subject teacher"), sortValue: (r) => (r.isClassTeacher ? 0 : 1), defaultHidden: true },
    { id: "students", header: "Students", align: "right", cell: (r) => (r.students === null ? <span className="text-muted">—</span> : r.students), exportValue: (r) => r.students ?? "" },
  ];
  return (
    <DataTable
      id="my-classes"
      rows={rows}
      columns={columns}
      getRowId={(r) => r.sectionId}
      searchText={(r) => `${r.className} ${r.section} ${r.subjects.join(" ")}`}
      filters={[{ id: "role", label: "My role", options: [{ value: "ct", label: "Class teacher" }, { value: "st", label: "Subject teacher" }], match: (r, v) => (v === "ct") === r.isClassTeacher }]}
      exportName={`my-classes-${yearName}`}
      emptyTitle="No classes assigned yet"
      emptyMessage="The Admin hasn't assigned you to a section yet."
    />
  );
}
