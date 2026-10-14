import { LinkTabs } from "@/components/ui/tabs";

export function AttendanceTabs({ current }: { current: "mark" | "reports" }) {
  return (
    <LinkTabs
      current={current}
      tabs={[
        { id: "mark", label: "Mark attendance", href: "/attendance" },
        { id: "reports", label: "Reports", href: "/attendance/reports" },
      ]}
    />
  );
}
