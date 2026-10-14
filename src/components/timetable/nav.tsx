import { LinkTabs } from "@/components/ui/tabs";

/** The four Timetable pages (editors only). */
export function TimetableTabs({ current, suffix = "" }: { current: "class" | "teachers" | "substitutions" | "bell"; suffix?: string }) {
  const q = suffix ? `?${suffix}` : "";
  return (
    <LinkTabs
      current={current}
      tabs={[
        { id: "class", label: "Class timetable", href: `/timetable${q}` },
        { id: "teachers", label: "Teacher timetable", href: `/timetable/teachers${q}` },
        { id: "substitutions", label: "Substitutions", href: `/timetable/substitutions` },
        { id: "bell", label: "Bell schedule", href: `/timetable/bell-schedule` },
      ]}
    />
  );
}
