import { requireCapability } from "@/lib/auth/session";
import { UserPlus } from "lucide-react";
import { Card, PageHeader } from "@/components/ui/card";
import { StaffForm } from "../staff-form";

export const metadata = { title: "Add staff" };

export default async function NewStaffPage() {
  await requireCapability("staff.edit");
  return (
    <>
      <PageHeader icon={<UserPlus />} title="Add staff member" />
      <Card>
        <StaffForm />
      </Card>
    </>
  );
}
