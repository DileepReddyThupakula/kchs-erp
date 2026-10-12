import { UserPlus } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { getSectionOptions, getStudentConfig } from "@/features/students/queries";
import { StudentForm } from "../student-form";

export const metadata = { title: "Add student" };

export default async function NewStudentPage() {
  await requireCapability("students.edit");
  const year = await resolveYear();
  const header = <PageHeader breadcrumbs={[{ label: "Students", href: "/students" }, { label: "Add student" }]} icon={<UserPlus />} title="Add student" description="Grouped sections; jump between them with the links below." />;
  if (!year) return (<>{header}<EmptyState title="No academic year yet">Set up the current academic year first.</EmptyState></>);
  const supabase = await createClient();
  const [sections, { definitions, docTypes }] = await Promise.all([getSectionOptions(supabase, year.id), getStudentConfig(supabase)]);
  return (
    <>
      {header}
      <StudentForm sections={sections} definitions={definitions} docTypes={docTypes} yearId={year.id} />
    </>
  );
}
