"use client";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/dialog";
import { useDrawer } from "@/components/ui/use-drawer";
import type { Staff } from "@/types/database";
import { StaffForm } from "../staff-form";

export function EditDetailsButton({ staff }: { staff: Staff }) {
  const drawer = useDrawer<Staff>();
  return (
    <>
      <Button onClick={() => drawer.openEdit(staff)}>
        <Pencil className="size-4" /> Edit details
      </Button>
      <Drawer open={drawer.open} onClose={drawer.close} title={`Edit ${staff.full_name}`} description={staff.employee_code}>
        <StaffForm staff={staff} onDone={drawer.close} />
      </Drawer>
    </>
  );
}
