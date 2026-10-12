import { CalendarClock } from "lucide-react";
import { requireTeacher } from "@/lib/auth/session";
import { EmptyState, PageHeader } from "@/components/ui/card";

export const metadata = { title: "My timetable" };

export default async function MyTimetablePage() {
  await requireTeacher();
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "My work" }, { label: "My timetable" }]} icon={<CalendarClock />} title="My timetable" description="Your periods for the week." />
      <EmptyState title="Coming soon">Your weekly timetable will appear here once the Timetable module (Module 3) is built.</EmptyState>
    </>
  );
}
