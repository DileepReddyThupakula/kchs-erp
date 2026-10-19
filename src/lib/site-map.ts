/**
 * SINGLE SOURCE OF TRUTH for every page in the ERP: the sidebar menu,
 * placeholder ("coming soon") pages, permission checks for placeholders, and
 * the Admin Roadmap page all read this file.
 *
 * When a module is built: add its real page file under src/app/(app)/… and
 * change that page's `status` here to "built". Nothing else changes.
 */
import {
  ArrowUpCircle,
  BadgeIndianRupee,
  BarChart3,
  BookOpen,
  BookOpenCheck,
  CalendarCheck,
  CalendarClock,
  CalendarOff,
  CalendarDays,
  ClipboardList,
  ClipboardPen,
  FileBadge,
  FileClock,
  FileSpreadsheet,
  GraduationCap,
  IdCard,
  LayoutDashboard,
  Map as MapIcon,
  Megaphone,
  NotebookPen,
  Percent,
  Receipt,
  ScrollText,
  School,
  Settings,
  ShieldCheck,
  UserCheck,
  UserRound,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { DUTY_INFO, holdsDuty, type AppRole, type Duty } from "@/lib/auth/permissions";

/** Planned modules, in build order (names, not numbers). */
export const MODULES = [
  { id: "foundation", name: "Foundation & school setup" },
  { id: "students", name: "Students" },
  { id: "timetable", name: "Timetable" },
  { id: "attendance", name: "Attendance & leave" },
  { id: "fees", name: "Fees" },
  { id: "exams", name: "Exams & marks" },
  { id: "notices", name: "Diary & notices" },
  { id: "reports", name: "Reports" },
  { id: "audit", name: "Audit log" },
] as const;
export type ModuleId = (typeof MODULES)[number]["id"];

export const ADMIN_GROUPS = ["Students", "Academics", "Fees", "Staff", "Reports", "School setup", "Administration"] as const;
export const TEACHER_GROUPS = ["My work", "Students", "Fees", "Academics"] as const;

/**
 * Who may open a page.
 *   admin:   Admin may open it.
 *   teacher: every teacher may open it (scope rule: own classes only).
 *   duty:    teachers holding this duty may open it.
 */
export type Access = { admin?: boolean; teacher?: boolean; duty?: Duty };

export type PageDef = {
  path: string;
  name: string;
  icon: LucideIcon;
  module: ModuleId;
  status: "built" | "planned";
  access: Access;
  /** Where it appears in each menu (omit = not in that menu). */
  menu: { admin?: (typeof ADMIN_GROUPS)[number] | "top"; teacher?: (typeof TEACHER_GROUPS)[number] | "top" };
  /** What the page will do (Admin / duty wording). */
  description: string;
  /** Teacher wording, following the scope rule (own classes only). */
  teacherDescription?: string;
};

export const PAGES: PageDef[] = [
  // ---------------------------------------------------------------- top
  { path: "/dashboard", name: "Dashboard", icon: LayoutDashboard, module: "foundation", status: "built", access: { admin: true, teacher: true }, menu: { admin: "top", teacher: "top" }, description: "Overview and quick actions." },

  // ---------------------------------------------------------------- teacher: my work
  { path: "/my/classes", name: "My classes", icon: School, module: "foundation", status: "built", access: { teacher: true }, menu: { teacher: "My work" }, description: "Your sections and the subjects you teach in each." },
  { path: "/my/timetable", name: "My timetable", icon: CalendarClock, module: "timetable", status: "built", access: { teacher: true }, menu: { teacher: "My work" }, description: "Your weekly periods.", teacherDescription: "Your own weekly periods across the sections you teach." },
  { path: "/my/leave", name: "My leave", icon: CalendarOff, module: "attendance", status: "built", access: { teacher: true }, menu: { teacher: "My work" }, description: "Apply for leave and see your requests.", teacherDescription: "Apply for leave, see the decision and your yearly balance, and your own attendance record." },
  { path: "/my/students", name: "My students", icon: GraduationCap, module: "students", status: "built", access: { teacher: true }, menu: { teacher: "My work" }, description: "Students of your sections.", teacherDescription: "Students of your own sections only: profiles, guardian phone numbers and addresses. No government ID numbers." },
  { path: "/attendance", name: "Attendance", icon: CalendarCheck, module: "attendance", status: "built", access: { admin: true, teacher: true }, menu: { admin: "Academics", teacher: "My work" }, description: "Morning and afternoon attendance for every section and date, including corrections and substitute marking.", teacherDescription: "Mark the morning or afternoon session for your own sections, for today only (the session your timetable gives you)." },
    { path: "/my/diary-notices", name: "Diary & notices", icon: NotebookPen, module: "notices", status: "built", access: { teacher: true }, menu: {}, description: "Diary and notices.", teacherDescription: "Older address: opens your notices. The diary of your own sections is under Diary." },
  { path: "/my/holidays", name: "Holiday list", icon: CalendarDays, module: "foundation", status: "built", access: { admin: true, teacher: true }, menu: { teacher: "My work" }, description: "Holidays of the current academic year." },

  // ---------------------------------------------------------------- students
  { path: "/students", name: "Students", icon: GraduationCap, module: "students", status: "built", access: { admin: true, duty: "student_records" }, menu: { admin: "Students", teacher: "Students" }, description: "Search, filter, add, edit, import and export students; profiles with guardians, siblings, documents and enrolment history." },
  { path: "/students/import", name: "Import students", icon: FileSpreadsheet, module: "students", status: "built", access: { admin: true, duty: "student_records" }, menu: { teacher: "Students" }, description: "Excel template with allowed values, row-by-row validation preview, error report and safe re-import without duplicates." },
  { path: "/students/promotion", name: "Promotion", icon: ArrowUpCircle, module: "students", status: "planned", access: { admin: true }, menu: { admin: "Students" }, description: "Move students to the next class at year end (promote, detain, mark left / TC issued)." },
  { path: "/students/certificates", name: "Certificates", icon: FileBadge, module: "students", status: "planned", access: { admin: true, duty: "certificates_idcards" }, menu: { admin: "Students", teacher: "Students" }, description: "Transfer, bonafide and study certificates with numbering and print layout." },
  { path: "/students/id-cards", name: "ID cards", icon: IdCard, module: "students", status: "planned", access: { admin: true, duty: "certificates_idcards" }, menu: { admin: "Students", teacher: "Students" }, description: "Print student ID cards by class or selection." },

  // ---------------------------------------------------------------- academics
  { path: "/timetable", name: "Timetable", icon: CalendarClock, module: "timetable", status: "built", access: { admin: true, duty: "timetable_edit" }, menu: { admin: "Academics", teacher: "Academics" }, description: "Class timetable, teacher timetable, substitutions and bell schedule (tabs on one page): set subject and teacher for every period with clash checks, cover absent teachers, and edit period times." },
  { path: "/timetable/teachers", name: "Teacher timetable", icon: CalendarClock, module: "timetable", status: "built", access: { admin: true, duty: "timetable_edit" }, menu: {}, description: "A teacher's whole week across all classes, with print and Excel." },
  { path: "/timetable/substitutions", name: "Substitutions", icon: CalendarClock, module: "timetable", status: "built", access: { admin: true, duty: "timetable_edit" }, menu: {}, description: "Cover an absent teacher's periods with a free teacher, for a date." },
  { path: "/timetable/bell-schedule", name: "Bell schedule", icon: CalendarClock, module: "timetable", status: "built", access: { admin: true, duty: "timetable_edit" }, menu: {}, description: "Period times, breaks and lunch; more than one schedule, assigned per class and weekday." },
    { path: "/attendance/all-classes", name: "All-class attendance", icon: CalendarCheck, module: "attendance", status: "built", access: { admin: true, duty: "all_class_attendance" }, menu: {}, description: "Mark or correct attendance for any section, session and date. This now lives on the Attendance page (older address)." },
  { path: "/attendance/reports", name: "Attendance reports", icon: CalendarCheck, module: "attendance", status: "built", access: { admin: true, teacher: true }, menu: {}, description: "Daily summary, monthly register with half days and percentages, low-attendance list, Excel and print.", teacherDescription: "Reports for the sections you are class teacher of, and the sessions you marked." },
  { path: "/exams", name: "Exams & marks", icon: BookOpenCheck, module: "exams", status: "built", access: { admin: true, teacher: true }, menu: { admin: "Academics", teacher: "My work" }, description: "One menu entry with tabs: Marks entry, Results (with the calculation shown), Grades & remarks, Locks and Scheme (Admin), and Report cards.", teacherDescription: "Enter marks for your own subjects and sections, see their results, and (class teachers) write remarks and print your section's report cards." },
  { path: "/exams/marks", name: "Marks entry", icon: ClipboardPen, module: "exams", status: "built", access: { admin: true, teacher: true }, menu: {}, description: "Tab of Exams & marks: enter marks (or Absent / Not applicable) per exam, section and subject; totals, grades and pass/fail are calculated by the database.", teacherDescription: "Enter marks for the subjects and sections assigned to you, until the exam is locked." },
  { path: "/exams/results", name: "Exam results", icon: BookOpenCheck, module: "exams", status: "built", access: { admin: true, teacher: true }, menu: {}, description: "Tab of Exams & marks: results per section and term with every calculation step shown.", teacherDescription: "Results of your own subjects, with the calculation shown." },
  { path: "/exams/grades", name: "Grades & remarks", icon: ClipboardPen, module: "exams", status: "built", access: { admin: true, teacher: true }, menu: {}, description: "Tab of Exams & marks: co-scholastic grades, grades for Nursery to UKG, and class teacher remarks.", teacherDescription: "Grades for your subjects; class teachers also write the term remarks." },
  { path: "/exams/locks", name: "Exam locks", icon: BookOpenCheck, module: "exams", status: "built", access: { admin: true, duty: "all_class_marks" }, menu: {}, description: "Tab of Exams & marks: lock and unlock exams (Admin; unlocking needs a reason) and see what is still not entered." },
  { path: "/exams/scheme", name: "Exam scheme", icon: Settings, module: "exams", status: "built", access: { admin: true }, menu: {}, description: "Tab of Exams & marks (Admin): exams, how they combine into terms and the final, pass marks, class modes, grading scale, co-scholastic grades and the remark bank." },
  { path: "/exams/report-cards", name: "Report cards", icon: ScrollText, module: "exams", status: "built", access: { admin: true, teacher: true }, menu: {}, description: "Tab of Exams & marks: print report cards of a locked term (Admin, the marks duty, and each class teacher for their own section).", teacherDescription: "Class teachers print the report cards of their own section." },
    { path: "/diary", name: "Diary", icon: NotebookPen, module: "notices", status: "built", access: { admin: true, teacher: true }, menu: { admin: "Academics", teacher: "Academics" }, description: "One menu entry with tabs: Class diary (review, publish and send each class), Published diary and All entries.", teacherDescription: "Submit diary (your own subjects) and Published diary (read only)." },
  { path: "/diary/class", name: "Class diary", icon: BookOpenCheck, module: "notices", status: "built", access: { admin: true, duty: "notices_diary" }, menu: {}, description: "Tab of Diary: review all subjects of a class together (English and Telugu side by side), remind teachers, edit, add an entry, publish, then print or send that class's image and message to its WhatsApp group." },
  { path: "/diary/submit", name: "Submit diary", icon: ClipboardPen, module: "notices", status: "built", access: { teacher: true }, menu: {}, description: "Tab of Diary: teachers submit their own subject's homework for their own sections (today up to 7 days ahead); the Telugu is added automatically.", teacherDescription: "Write the homework in English for each section and subject you teach and submit it. The Telugu is added automatically." },
  { path: "/diary/published", name: "Published diary", icon: NotebookPen, module: "notices", status: "built", access: { admin: true, teacher: true }, menu: {}, description: "Tab of Diary: the published diary by section and day.", teacherDescription: "The published diary of the sections you teach (read only)." },
  { path: "/diary/entries", name: "All diary entries", icon: NotebookPen, module: "notices", status: "built", access: { admin: true, duty: "notices_diary" }, menu: {}, description: "Tab of Diary: every entry with filters, edit, publish and export (archiving is Admin only)." },
  { path: "/notices", name: "Notices", icon: Megaphone, module: "notices", status: "built", access: { admin: true, teacher: true }, menu: { admin: "Academics", teacher: "Academics" }, description: "Circulars and announcements with audience, circular numbers, attachments, read counts; print and WhatsApp copy for Admin and the duty (adding is Admin and the notices & diary duty; archiving is Admin only).", teacherDescription: "Notices addressed to you; mark them as read." },

  // ---------------------------------------------------------------- fees
  { path: "/fees/collect", name: "Collect fee", icon: Wallet, module: "fees", status: "built", access: { admin: true, duty: "fee_collection" }, menu: { admin: "Fees", teacher: "Fees" }, description: "Look up any student, collect fees and print a receipt." },
  { path: "/fees/receipts", name: "Receipts", icon: Receipt, module: "fees", status: "built", access: { admin: true, duty: "fee_collection" }, menu: { admin: "Fees", teacher: "Fees" }, description: "Search and reprint receipts (cancelling a receipt is Admin only)." },
  { path: "/fees/dues", name: "Dues", icon: BadgeIndianRupee, module: "fees", status: "built", access: { admin: true, duty: "fee_collection" }, menu: { admin: "Fees", teacher: "Fees" }, description: "Outstanding fees by class, student and installment." },
  { path: "/fees/reports", name: "Fee reports", icon: BarChart3, module: "fees", status: "built", access: { admin: true, duty: "fee_collection" }, menu: { admin: "Fees", teacher: "Fees" }, description: "Daily collection and date-range reports with totals by payment mode and fee head." },
  { path: "/fees/setup", name: "Fee setup", icon: Settings, module: "fees", status: "built", access: { admin: true }, menu: { admin: "Fees" }, description: "Fee heads, installments and due dates, and the fee plan per class." },
  { path: "/fees/concessions", name: "Concessions", icon: Percent, module: "fees", status: "built", access: { admin: true }, menu: { admin: "Fees" }, description: "Concession types and which students receive them." },

  // ---------------------------------------------------------------- staff
  { path: "/staff", name: "Staff list", icon: Users, module: "foundation", status: "built", access: { admin: true }, menu: { admin: "Staff" }, description: "Staff records, logins and teacher duties." },
  { path: "/staff/attendance", name: "Staff attendance", icon: UserCheck, module: "attendance", status: "built", access: { admin: true }, menu: { admin: "Staff" }, description: "Daily staff attendance with in and out times." },
  { path: "/staff/leave", name: "Leave", icon: FileClock, module: "attendance", status: "built", access: { admin: true }, menu: { admin: "Staff" }, description: "Staff leave requests, approvals and balances (approval is Admin only)." },

  // ---------------------------------------------------------------- reports
  { path: "/reports", name: "Reports", icon: BarChart3, module: "reports", status: "built", access: { admin: true, teacher: true }, menu: { admin: "Reports", teacher: "My work" }, description: "Every report you may open, with Excel / CSV export and A4 print (all logged).", teacherDescription: "The reports for your own sections and subjects." },
  { path: "/reports/strength", name: "Students: strength and demographics", icon: Users, module: "reports", status: "built", access: { admin: true, teacher: true }, menu: {}, description: "Strength by section; demographics, admissions and leavers for Admin and student records.", teacherDescription: "The strength of your own sections." },
  { path: "/reports/fees", name: "Fee summary", icon: BadgeIndianRupee, module: "reports", status: "built", access: { admin: true, duty: "fee_collection" }, menu: {}, description: "Dues by class, collection by month and concessions by fee head. Admin and office staff with fee access only." },
  { path: "/reports/exams", name: "Results summary", icon: BookOpenCheck, module: "reports", status: "built", access: { admin: true, teacher: true }, menu: {}, description: "Pass, fail and incomplete per section; subject averages.", teacherDescription: "How your own subjects and sections did." },
  { path: "/reports/staff", name: "Staff attendance summary", icon: UserCheck, module: "reports", status: "built", access: { admin: true }, menu: {}, description: "Present, late, absent and on-leave days per staff member for a period." },
  { path: "/reports/my-load", name: "My timetable and duties", icon: CalendarClock, module: "reports", status: "built", access: { teacher: true }, menu: {}, description: "Your own periods, substitutions and leave." },
  { path: "/reports/government-export", name: "Government data export", icon: ShieldCheck, module: "students", status: "built", access: { admin: true }, menu: { admin: "Reports" }, description: "UDISE+ / AP Child Info format export. IDs masked unless Admin chooses otherwise; every export is logged." },

  // ---------------------------------------------------------------- school setup
  { path: "/setup/academic-years", name: "Academic years & holidays", icon: CalendarDays, module: "foundation", status: "built", access: { admin: true }, menu: { admin: "School setup" }, description: "Academic years and their holidays." },
  { path: "/setup/classes", name: "Classes & sections", icon: School, module: "foundation", status: "built", access: { admin: true }, menu: { admin: "School setup" }, description: "Classes and their sections per year." },
  { path: "/setup/subjects", name: "Subjects", icon: BookOpen, module: "foundation", status: "built", access: { admin: true }, menu: { admin: "School setup" }, description: "Subjects and which classes study them." },
  { path: "/setup/assignments", name: "Teacher assignments", icon: ClipboardList, module: "foundation", status: "built", access: { admin: true }, menu: { admin: "School setup" }, description: "Which teacher teaches which subject in each section." },

  // ---------------------------------------------------------------- administration
  { path: "/settings", name: "School settings", icon: Settings, module: "foundation", status: "built", access: { admin: true }, menu: { admin: "Administration" }, description: "School details, branding and calendar settings." },
  { path: "/audit-log", name: "Audit log", icon: UserRound, module: "audit", status: "built", access: { admin: true }, menu: { admin: "Administration" }, description: "Who changed what and when, across every module, including exports and duty changes." },
  { path: "/roadmap", name: "Roadmap", icon: MapIcon, module: "foundation", status: "built", access: { admin: true }, menu: { admin: "Administration" }, description: "Every module with its pages and progress." },
];

export type Who = { role: AppRole; duties: readonly Duty[] };

/** May this person open this page? (Placeholders and the menu use this.) */
export function canOpenPage(page: PageDef, who: Who): boolean {
  const a = page.access;
  if (who.role === "admin") return !!a.admin;
  // teachers and office staff: pages open to every staff member, plus the pages of the duties they hold
  // (fee pages: office staff with fee access only, never a teacher)
  return !!a.teacher || (!!a.duty && holdsDuty(who, a.duty));
}

/** Plain-language "who can use this page". */
export function whoCanUse(page: PageDef): string[] {
  const out: string[] = [];
  if (page.access.admin) out.push("Admin");
  if (page.access.teacher) out.push("Teachers (own classes only)");
  if (page.access.duty) out.push(`Teachers with the “${DUTY_INFO[page.access.duty].label}” duty`);
  return out;
}

export function moduleName(id: ModuleId) {
  return MODULES.find((m) => m.id === id)?.name ?? id;
}

export function findPage(path: string) {
  return PAGES.find((p) => p.path === path);
}

export type MenuGroup = { label?: string; items: PageDef[] };

/** The sidebar for this person, built from PAGES. */
export function buildMenu(who: Who): MenuGroup[] {
  const isAdmin = who.role === "admin";
  const order: readonly string[] = isAdmin ? ADMIN_GROUPS : TEACHER_GROUPS;
  const placed = PAGES.filter((p) => canOpenPage(p, who)).map((p) => ({ p, g: isAdmin ? p.menu.admin : p.menu.teacher })).filter((x) => x.g);
  const groups: MenuGroup[] = [{ items: placed.filter((x) => x.g === "top").map((x) => x.p) }];
  for (const label of order) {
    const items = placed.filter((x) => x.g === label).map((x) => x.p);
    if (items.length) groups.push({ label, items });
  }
  return groups.filter((g) => g.items.length);
}
