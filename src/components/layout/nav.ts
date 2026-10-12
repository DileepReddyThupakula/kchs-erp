import { BookOpen, CalendarDays, ClipboardList, LayoutDashboard, School, Settings, Users, type LucideIcon } from "lucide-react";
import type { Capability } from "@/lib/auth/permissions";

/** `cap`: shown only to people who hold that capability (role or duty). */
export type NavItem = { href: string; label: string; icon: LucideIcon; cap?: Capability };
export type NavGroup = { label?: string; items: NavItem[] };

/** Sidebar entries. Modules not built yet are left out on purpose. */
export const NAV: NavGroup[] = [
  { items: [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }] },
  {
    label: "School setup",
    items: [
      { href: "/setup/academic-years", label: "Academic years & holidays", icon: CalendarDays },
      { href: "/setup/classes", label: "Classes & sections", icon: School },
      { href: "/setup/subjects", label: "Subjects", icon: BookOpen },
      { href: "/setup/assignments", label: "Teacher assignments", icon: ClipboardList },
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
