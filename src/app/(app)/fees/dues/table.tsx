"use client";
import Link from "next/link";
import { useMemo } from "react";
import { Wallet } from "lucide-react";
import { DataTable, type Column, type RowAction } from "@/components/data-table/data-table";
import { Drawer } from "@/components/ui/dialog";
import { Badge, Card } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button-classes";
import { useDrawer } from "@/components/ui/use-drawer";
import { formatDate } from "@/lib/utils";
import { formatPaise } from "@/lib/money";

type DueLine = { id: string; headId: string; headName: string; isSpecial: boolean; label: string; dueDate: string; balance: number };
export type StudentDues = {
  studentId: string;
  name: string;
  adm: string;
  classId: string | null;
  sectionId: string | null;
  classLabel: string;
  classOrder: number;
  phone: string | null;
  outstanding: number;
  overdue: number;
  nextDue: string | null;
  dues: DueLine[];
};

export function DuesTable({ rows, today, yearName, classes, sections, heads }: { rows: StudentDues[]; today: string; yearName: string; classes: { id: string; name: string }[]; sections: { id: string; label: string }[]; heads: { id: string; name: string; special: boolean }[] }) {
  const drawer = useDrawer<StudentDues>();
  const total = useMemo(() => rows.reduce((a, r) => a + r.outstanding, 0), [rows]);
  const overdue = useMemo(() => rows.reduce((a, r) => a + r.overdue, 0), [rows]);

  const columns: Column<StudentDues>[] = [
    {
      id: "student",
      header: "Student",
      hideable: false,
      pinned: "left",
      className: "whitespace-nowrap",
      cell: (r) => (
        <Link href={`/students/${r.studentId}?tab=fees`} className="font-medium text-navy-800 hover:underline">
          {r.name}
        </Link>
      ),
      sortValue: (r) => r.name,
    },
    { id: "adm", header: "Adm no", cell: (r) => <span className="font-mono text-xs">{r.adm}</span>, sortValue: (r) => r.adm },
    { id: "class", header: "Class", className: "whitespace-nowrap", cell: (r) => r.classLabel, sortValue: (r) => r.classOrder },
    { id: "phone", header: "Phone", className: "whitespace-nowrap", cell: (r) => r.phone ?? "—", sortValue: (r) => r.phone ?? "" },
    { id: "heads", header: "Fee heads", cell: (r) => <span className="text-xs">{[...new Set(r.dues.map((d) => d.headName))].join(", ")}</span>, exportValue: (r) => [...new Set(r.dues.map((d) => d.headName))].join(", ") },
    { id: "next", header: "Next due", className: "whitespace-nowrap", cell: (r) => formatDate(r.nextDue), sortValue: (r) => r.nextDue ?? "", exportValue: (r) => r.nextDue ?? "" },
    { id: "count", header: "Dues", align: "right", cell: (r) => r.dues.length, sortValue: (r) => r.dues.length },
    {
      id: "overdue",
      header: "Overdue",
      align: "right",
      className: "whitespace-nowrap",
      cell: (r) => (r.overdue ? <span className="font-medium tabular-nums text-red-700">{formatPaise(r.overdue)}</span> : <span className="text-muted">—</span>),
      sortValue: (r) => r.overdue,
      exportValue: (r) => r.overdue / 100,
    },
    { id: "outstanding", header: "Outstanding", align: "right", className: "whitespace-nowrap", cell: (r) => <span className="font-semibold tabular-nums text-navy-900">{formatPaise(r.outstanding)}</span>, sortValue: (r) => r.outstanding, exportValue: (r) => r.outstanding / 100 },
  ];
  const actions = (r: StudentDues): RowAction[] => [
    { id: "view", kind: "view", label: "View dues", onClick: () => drawer.openView(r) },
    { id: "collect", kind: "edit", label: "Collect", href: `/fees/collect?student=${r.studentId}` },
    { id: "profile", kind: "menu", label: "Student fees tab", href: `/students/${r.studentId}?tab=fees` },
  ];
  const cur = drawer.item;

  return (
    <>
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Card>
          <p className="text-xs text-muted">Students with dues</p>
          <p className="text-2xl font-semibold tabular-nums text-navy-900">{rows.length}</p>
        </Card>
        <Card>
          <p className="text-xs text-muted">Total outstanding</p>
          <p className="text-2xl font-semibold tabular-nums text-navy-900">{formatPaise(total)}</p>
        </Card>
        <Card className="col-span-2 lg:col-span-1">
          <p className="text-xs text-muted">Of which overdue</p>
          <p className="text-2xl font-semibold tabular-nums text-red-700">{formatPaise(overdue)}</p>
        </Card>
      </div>
      <DataTable
        id="dues"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.studentId}
        searchText={(r) => `${r.name} ${r.adm} ${r.phone ?? ""}`}
        searchPlaceholder="Search name, admission no, phone…"
        filters={[
          { id: "class", label: "Class", options: classes.map((c) => ({ value: c.id, label: c.name })), match: (r, v) => r.classId === v },
          { id: "section", label: "Section", options: sections.map((s) => ({ value: s.id, label: s.label })), match: (r, v) => r.sectionId === v },
          { id: "overdue", label: "Overdue", options: [{ value: "yes", label: "Overdue only" }], match: (r) => r.overdue > 0 },
          { id: "head", label: "Fee head", options: heads.filter((h) => !h.special).map((h) => ({ value: h.id, label: h.name })), match: (r, v) => r.dues.some((d) => d.headId === v) },
          { id: "special", label: "Special fee", options: heads.filter((h) => h.special).map((h) => ({ value: h.id, label: h.name })), match: (r, v) => r.dues.some((d) => d.headId === v) },
        ]}
        pageSize={50}
        rowActions={actions}
        onRowClick={(r) => drawer.openView(r)}
        rowLabel={(r) => r.name}
        exportName={`dues-${yearName}`}
        emptyTitle="No outstanding dues"
        emptyMessage="Every student is paid up. 🎉"
      />
      <Drawer open={drawer.open} onClose={drawer.close} title={cur ? `${cur.name} · dues` : ""} description={cur ? `${cur.adm} · ${cur.classLabel}` : undefined}>
        {cur && (
          <div className="flex h-full flex-col">
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="mb-3 text-2xl font-semibold tabular-nums text-navy-900">{formatPaise(cur.outstanding)}</p>
              <ul className="divide-y divide-border text-sm">
                {[...cur.dues]
                  .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
                  .map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-2">
                      <span>
                        <span className="font-medium text-navy-900">{d.headName}</span> <span className="text-xs text-muted">{d.label}</span>
                        {d.isSpecial && <Badge tone="gold" className="ml-1.5">Special</Badge>}
                        <span className="block text-xs text-muted">
                          Due {formatDate(d.dueDate)} {d.dueDate < today && <Badge tone="danger" className="ml-1">Overdue</Badge>}
                        </span>
                      </span>
                      <span className="font-semibold tabular-nums">{formatPaise(d.balance)}</span>
                    </li>
                  ))}
              </ul>
            </div>
            <div className="flex justify-end gap-2 border-t border-border bg-cream-50 px-5 py-3">
              <Link href={`/fees/collect?student=${cur.studentId}`} className={buttonClasses("primary")}>
                <Wallet className="size-4" aria-hidden /> Collect fee
              </Link>
            </div>
          </div>
        )}
      </Drawer>
    </>
  );
}
