import { redirect } from "next/navigation";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { ClassDay } from "@/components/notices/class-day";
import { getClassDay } from "@/features/notices/diary-workflow";
import { getSubjectNameMap, getSubjectTeMap } from "@/features/notices/queries";
import { getDiaryCardSchool } from "@/features/notices/card-school";
import { getSectionsInfo } from "@/features/timetable/queries";
import { todayIst } from "@/features/fees/shared";

export const metadata = { title: "Class diary" };

export default async function ClassDiaryDay({ params, searchParams }: { params: Promise<{ section: string }>; searchParams: Promise<{ date?: string; send?: string }> }) {
  const [{ section: sectionId }, sp] = await Promise.all([params, searchParams]);
  await requirePage("/diary/class");
  const supabase = await createClient();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayIst();
  const year = await resolveYear();
  if (!year) redirect("/diary/class");
  const sections = await getSectionsInfo(supabase, year.id);
  const section = sections.find((s) => s.id === sectionId);
  if (!section) redirect("/diary/class");
  const [subjects, subjectsTe] = await Promise.all([getSubjectNameMap(supabase), getSubjectTeMap(supabase)]);
  const [lines, school] = await Promise.all([getClassDay(supabase, sectionId, date, subjects, subjectsTe), getDiaryCardSchool()]);
  return (
    <>
            <ClassDay
        sectionId={sectionId}
        classLabel={section.label}
        date={date}
        lines={lines}
        school={school}
        subjects={Object.entries(subjects).map(([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label))}
        autoSend={sp.send === "1"}
      />
    </>
  );
}
