import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  GraduationCap,
  PartyPopper,
  Circle,
  ClipboardList,
  School,
  Settings,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { can, DUTY_INFO, type Capability } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { getSchoolSettings, resolveYear } from "@/lib/settings";
import { detailsChecklist } from "@/features/settings/missing";
import { getMyClasses } from "@/features/my/queries";
import { formatDate } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { TodayStrip } from "@/components/timetable/today-strip";
import { AttendanceDashboard } from "@/components/attendance/dashboard-card";
import { cn } from "@/lib/utils";

export const metadata = { title: "Dashboard" };

function greeting(timezone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Shown when the person holds `cap` (no cap = everyone); `teacherOnly` = teachers only. */
type Action = { href: string; label: string; icon: LucideIcon; cap?: Capability; teacherOnly?: boolean };
const QUICK_ACTIONS: Action[] = [
  { href: "/staff?new=1", label: "Add staff member", icon: UserPlus, cap: "staff.edit" },
  { href: "/setup/academic-years", label: "Holidays & years", icon: CalendarDays, cap: "setup.edit" },
  { href: "/setup/assignments", label: "Assign teachers", icon: ClipboardList, cap: "assignments.edit" },
  { href: "/settings", label: "School settings", icon: Settings, cap: "settings.edit" },
  { href: "/my/classes", label: "My classes", icon: School, teacherOnly: true },
  { href: "/my/timetable", label: "My timetable", icon: CalendarClock, teacherOnly: true },
  { href: "/my/holidays", label: "Holiday list", icon: CalendarDays, teacherOnly: true },
];

type Stat = { label: string; value: number | string; icon: LucideIcon; accent: keyof typeof ACCENTS; href?: string; hint?: string };

const ACCENTS = {
  navy: "bg-navy-100 text-navy-700",
  gold: "bg-gold-100 text-gold-800",
  green: "bg-peacock-100 text-peacock-700",
  cream: "bg-cream-200 text-navy-800",
} as const;

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const me = await requireStaff();
  const supabase = await createClient();
  const [settings, year] = await Promise.all([getSchoolSettings(), resolveYear()]);

  const checklist = can(me, "settings.edit") ? detailsChecklist(settings) : [];
  const actions = QUICK_ACTIONS.filter((a) => (a.teacherOnly ? me.role === "teacher" : !a.cap || can(me, a.cap)));
  const stats = me.role === "teacher" ? await teacherStats() : await schoolStats();

  // Teachers see their own numbers only (scope rule R18).
  async function teacherStats(): Promise<Stat[]> {
    const mine = year ? await getMyClasses(me, year.id) : [];
    const today = new Date().toISOString().slice(0, 10);
    const { data: next } = year
      ? await supabase.from("holidays").select("date, name").eq("academic_year_id", year.id).gte("date", today).order("date").limit(1).maybeSingle()
      : { data: null };
    return [
      { label: "My classes", value: mine.length, icon: School, accent: "navy", href: "/my/classes" },
      { label: "My subjects", value: new Set(mine.flatMap((m) => m.subjects)).size, icon: BookOpen, accent: "green", href: "/my/classes" },
      { label: "My students", value: mine.reduce((n, m) => n + (m.students ?? 0), 0), icon: GraduationCap, accent: "gold", href: "/my/students" },
      { label: next ? `Next holiday · ${next.name}` : "Next holiday", value: next ? formatDate(next.date) : "—", icon: PartyPopper, accent: "cream", href: "/my/holidays" },
    ];
  }

  async function schoolStats(): Promise<Stat[]> {
    const [classes, sections, subjects, staff] = await Promise.all([
      supabase.from("classes").select("id", { count: "exact", head: true }).eq("is_active", true),
      year
        ? supabase.from("sections").select("id", { count: "exact", head: true }).eq("academic_year_id", year.id)
        : Promise.resolve({ count: 0 }),
      supabase.from("subjects").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.rpc("staff_directory"),
    ]);
    const activeStaff = (staff.data ?? []).filter((s) => s.status === "active").length;
    const setup = can(me, "setup.view");
    return [
      { label: "Classes", value: classes.count ?? 0, icon: School, accent: "navy", href: setup ? "/setup/classes?tab=classes" : undefined },
      { label: `Sections ${year ? year.name : ""}`, value: sections.count ?? 0, icon: ClipboardList, accent: "gold", href: setup ? "/setup/classes" : undefined },
      { label: "Subjects", value: subjects.count ?? 0, icon: BookOpen, accent: "green", href: setup ? "/setup/subjects" : undefined },
      { label: "Active staff", value: activeStaff, icon: Users, accent: "cream", href: can(me, "staff.viewAll") ? "/staff" : undefined },
    ];
  }
  const remaining = checklist.filter((c) => !c.done).length;
  const firstName = me.fullName.split(" ")[0];


  return (
    <>
      <div className="mb-6">
        <p className="text-sm font-medium text-gold-700">{year ? `Academic year ${year.name}` : "No academic year set up yet"}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-navy-900 sm:text-3xl">
          {greeting(settings?.timezone ?? "Asia/Kolkata")}, {firstName}
        </h1>
        <p className="mt-1 text-sm text-muted">{settings?.name}</p>
      </div>

      {error === "forbidden" && (
        <p role="alert" className="mb-4 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          You don&apos;t have permission to open that page.
        </p>
      )}

      {me.role === "teacher" && <TodayStrip />}
      <AttendanceDashboard me={me} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map(({ label, value, icon: Icon, accent, href, hint }) => {
          const body = (
            <Card className={cn("flex h-full items-center gap-3", href && "transition-[box-shadow,border-color] group-hover:border-gold-300 group-hover:shadow-[var(--shadow-lift)]")}>
              <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl", ACCENTS[accent])}>
                <Icon className="size-5" aria-hidden />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-2xl font-semibold tabular-nums text-navy-900">{value}</p>
                <p className="truncate text-xs text-muted sm:text-sm">{label}</p>
                {hint && <p className="truncate text-[11px] text-ink-muted/80">{hint}</p>}
              </div>
              {href && <ArrowRight className="size-4 shrink-0 text-navy-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gold-700" aria-hidden />}
            </Card>
          );
          return href ? (
            <Link key={label} href={href} className="group rounded-[var(--radius-card)]" aria-label={`${label}: ${value}. Open`}>
              {body}
            </Link>
          ) : (
            <div key={label}>{body}</div>
          );
        })}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_22rem]">
        <Card>
          <h2 className="mb-3 font-semibold text-navy-900">Quick actions</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {actions.map(({ href, label, icon: Icon }) => (
              <Link
                key={href + label}
                href={href}
                className="group flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm font-medium text-navy-800 transition-colors hover:border-gold-300 hover:bg-gold-50"
              >
                <Icon className="size-4 text-navy-500 group-hover:text-gold-700" aria-hidden />
                <span className="flex-1">{label}</span>
                <ArrowRight className="size-4 text-navy-300 transition-transform group-hover:translate-x-0.5 group-hover:text-gold-700" aria-hidden />
              </Link>
            ))}
          </div>
        </Card>

        {me.role === "teacher" && (
          <Card>
            <h2 className="mb-1 font-semibold text-navy-900">Your duties</h2>
            {me.duties.length ? (
              <ul className="mt-2 space-y-1.5 text-sm">
                {me.duties.map((d) => (
                  <li key={d} className="flex items-center gap-2 text-navy-900">
                    <CheckCircle2 className="size-4 text-peacock-600" aria-hidden /> {DUTY_INFO[d].label}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted">No extra duties. You see your own classes and subjects. The Admin can give you duties such as fee collection.</p>
            )}
          </Card>
        )}

        {checklist.length > 0 && remaining > 0 && (
          <Card className="border-gold-200 bg-gold-50/60">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-semibold text-navy-900">School details to fill in</h2>
              <span className="text-xs text-muted">
                {checklist.length - remaining}/{checklist.length} done
              </span>
            </div>
            <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-gold-100">
              <div className="h-full rounded-full bg-gold-500" style={{ width: `${((checklist.length - remaining) / checklist.length) * 100}%` }} />
            </div>
            <ul className="space-y-1.5 text-sm">
              {checklist.map((c) => (
                <li key={c.label} className={cn("flex items-center gap-2", c.done ? "text-muted line-through" : "text-navy-900")}>
                  {c.done ? <CheckCircle2 className="size-4 text-peacock-600" aria-label="done" /> : <Circle className="size-4 text-gold-600" aria-label="to do" />}
                  {c.label}
                </li>
              ))}
            </ul>
            <Link href="/settings" className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-navy-700 hover:underline">
              Open school settings <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Card>
        )}
      </div>
    </>
  );
}
