import { School } from "lucide-react";
import { requireTeacher } from "@/lib/auth/session";
import { resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { getMyClasses } from "@/features/my/queries";
import { MyClassesTable } from "./table";

export const metadata = { title: "My classes" };

export default async function MyClassesPage() {
  const me = await requireTeacher();
  const year = await resolveYear();
  const rows = year ? await getMyClasses(me, year.id) : [];
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "My work" }, { label: "My classes" }]}
        icon={<School />}
        title="My classes"
        description={year ? `Sections you teach in ${year.name}, and the subjects you teach in each.` : undefined}
      />
      {!year ? <EmptyState title="No academic year yet">The Admin hasn&apos;t set up the current academic year.</EmptyState> : <MyClassesTable rows={rows} yearName={year.name} />}
    </>
  );
}
