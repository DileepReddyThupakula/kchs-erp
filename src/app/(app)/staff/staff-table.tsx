"use client";
import Link from "next/link";
import { useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { KeyRound, UserPlus } from "lucide-react";
import type { RowAction } from "@/components/data-table/data-table";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { Drawer } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RoleBadge, StatusChip } from "@/components/ui/card";
import { useDrawer } from "@/components/ui/use-drawer";
import { formatDate } from "@/lib/utils";
import type { Staff } from "@/types/database";
import { StaffForm } from "./staff-form";

export type StaffRow = Staff & { duties: number };

export function StaffTable({ rows, editable }: { rows: StaffRow[]; editable: boolean }) {
  const drawer = useDrawer<StaffRow>();
  const params = useSearchParams();
  const { openNew } = drawer;
  // Dashboard "Add staff member" links here with ?new=1
  useEffect(() => {
    if (editable && params.get("new") === "1") openNew();
  }, [editable, params, openNew]);
  const access = (r: StaffRow) => (r.user_id && r.app_role ? r.app_role : "none");
  const columns: Column<StaffRow>[] = [
    { id: "code", header: "Code", cell: (r) => <span className="font-mono text-xs">{r.employee_code}</span>, sortValue: (r) => r.employee_code },
    {
      id: "name",
      header: "Name",
      hideable: false,
      pinned: "left",
      cell: (r) => (
        <Link href={`/staff/${r.id}`} className="font-medium text-navy-800 hover:text-navy-900 hover:underline">
          {r.full_name}
        </Link>
      ),
      sortValue: (r) => r.full_name,
      className: "whitespace-nowrap",
    },
    { id: "designation", header: "Designation", cell: (r) => r.designation ?? "—", sortValue: (r) => r.designation ?? "" },
    { id: "department", header: "Department", cell: (r) => r.department ?? "—", sortValue: (r) => r.department ?? "", defaultHidden: true },
    { id: "phone", header: "Phone", cell: (r) => r.phone ?? "—", sortValue: (r) => r.phone ?? "" },
    { id: "email", header: "Email", cell: (r) => r.email ?? "—", sortValue: (r) => r.email ?? "", defaultHidden: true },
    { id: "joined", header: "Joined", cell: (r) => formatDate(r.date_of_joining), sortValue: (r) => r.date_of_joining ?? "", defaultHidden: true },
    { id: "status", header: "Status", cell: (r) => <StatusChip status={r.status} />, sortValue: (r) => r.status },
    {
      id: "access",
      header: "ERP access",
      cell: (r) => (access(r) === "none" ? <span className="text-muted">No login</span> : <RoleBadge role={r.app_role!} />),
      sortValue: (r) => access(r),
    },
    {
      id: "duties",
      header: "Duties",
      align: "right",
      cell: (r) => (r.app_role === "admin" ? <span className="text-muted">All</span> : r.app_role === "teacher" ? r.duties : "—"),
      sortValue: (r) => (r.app_role === "admin" ? 99 : r.duties),
    },
  ];
  const staffActions = (r: StaffRow): RowAction[] => [
    { id: "view", kind: "view", label: "View", href: `/staff/${r.id}` },
    ...(editable
      ? ([
          { id: "edit", kind: "edit", label: "Edit details", onClick: () => drawer.openEdit(r) },
          { id: "access", kind: "menu", label: "Login & duties", icon: KeyRound, href: `/staff/${r.id}` },
        ] satisfies RowAction[])
      : []),
  ];
  const designations = [...new Set(rows.map((r) => r.designation).filter(Boolean))].sort() as string[];
  return (
    <>
      <DataTable
        id="staff"
        rowActions={staffActions}
        rowHref={(r) => `/staff/${r.id}`}
        rowLabel={(r) => r.full_name}
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id}
        searchText={(r) => `${r.full_name} ${r.employee_code} ${r.phone ?? ""} ${r.designation ?? ""}`}
        searchPlaceholder="Search name, code, phone…"
        initialFilters={{ status: "active" }}
        filters={[
          { id: "status", label: "Status", options: [{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "left", label: "Left" }], match: (r, v) => r.status === v },
          {
            id: "access",
            label: "ERP access",
            options: [{ value: "admin", label: "Admin" }, { value: "teacher", label: "Teacher" }, { value: "none", label: "No login" }],
            match: (r, v) => access(r) === v,
          },
          { id: "designation", label: "Designation", options: designations.map((d) => ({ value: d, label: d })), match: (r, v) => r.designation === v },
        ]}
        selectable
        bulkActions={() => <span className="text-xs text-navy-200">Use Export to download the selected staff.</span>}
        exportName="staff"
        emptyMessage="Add your first staff member."
        toolbar={
          editable && (
            <Button onClick={drawer.openNew}>
              <UserPlus className="size-4" /> Add staff
            </Button>
          )
        }
      />
      {editable && (
        <Drawer open={drawer.open} onClose={drawer.close} title={drawer.item ? `Edit ${drawer.item.full_name}` : "Add staff member"} description={drawer.item ? drawer.item.employee_code : "You can create their login and duties on the next screen."}>
          <StaffForm staff={drawer.item} onDone={drawer.close} />
        </Drawer>
      )}
    </>
  );
}
