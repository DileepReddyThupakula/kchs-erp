import { BookOpen, CalendarClock, CalendarDays, ClipboardList, LayoutDashboard, School, Settings, Users, type LucideIcon } from "lucide-react";
import type { Capability } from "@/lib/auth/permissions";

/**
 * `cap`: shown only to people holding that capability (role or duty).
 * `teacherOnly`: teachers' own pages (Admin uses the full setup pages).
 */
export type NavItem = { href: string; label: string; icon: LucideIcon; cap?: Capability; teacherOnly?: boolean };
export type NavGroup = { label?: string; items: NavItem[] };

/** Sidebar entries. Modules not built yet are left out on purpose. */
export const NAV: NavGroup[] = [
  { items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "My work",
    items: [
      { href: "/my/classes", label: "My classes", icon: School, teacherOnly: true },
      { href: "/my/timetable", label: "My timetable", icon: CalendarClock, teacherOnly: true },
      { href: "/my/holidays", label: "Holiday list", icon: CalendarDays, teacherOnly: true },
    ],
  },
  {
    label: "School setup",
    items: [
      { href: "/setup/academic-years", label: "Academic years & holidays", icon: CalendarDays, cap: "setup.view" },
      { href: "/setup/classes", label: "Classes & sections", icon: School, cap: "setup.view" },
      { href: "/setup/subjects", label: "Subjects", icon: BookOpen, cap: "setup.view" },
      { href: "/setup/assignments", label: "Teacher assignments", icon: ClipboardList, cap: "setup.view" },
    ],
  },
  {
    label: "People",
    items: [{ href: "/staff", label: "Staff", icon: Users, cap: "staff.viewAll" }],
  },
  {
    label: "Administration",
    items: [{ href: "/settings", label: "School settings", icon: Settings, cap: "settings.edit" }],
  },
];
