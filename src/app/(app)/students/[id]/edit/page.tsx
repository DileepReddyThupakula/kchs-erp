import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { PageHeader } from "@/components/ui/card";
import { getSectionOptions, getStudentConfig, getStudentProfile } from "@/features/students/queries";
import { StudentForm } from "../../student-form";

export const metadata = { title: "Edit student" };

export default async function EditStudentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireCapability("students.edit");
  const year = await resolveYear();
  const profile = await getStudentProfile(id);
  if (!profile || !year) notFound();
  const supabase = await createClient();
  const [sections, { definitions, docTypes }] = await Promise.all([getSectionOptions(supabase, year.id), getStudentConfig(supabase)]);
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Students", href: "/students" }, { label: profile.student.full_name, href: `/students/${id}` }, { label: "Edit" }]}
        icon={<Pencil />}
        title={`Edit ${profile.student.full_name}`}
        description={`Admission no ${profile.student.admission_no}. Status is changed by the Admin on the profile page.`}
      />
      <StudentForm sections={sections} definitions={definitions} docTypes={docTypes} yearId={year.id} existing={profile} />
    </>
  );
}
