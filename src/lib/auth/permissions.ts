/**
 * Permission model v2 (see DECISIONS.md, R13):
 *   - Active roles: admin, teacher. computer_staff exists in the database
 *     for the future but can't be assigned and is hidden from the UI.
 *   - Teachers get extra module access only through duties granted by Admin.
 * This drives what the UI shows and what server actions allow; the database
 * RLS policies (public.has_duty) enforce the same rules independently.
 */
export type AppRole = "admin" | "computer_staff" | "teacher";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  computer_staff: "Computer Staff",
  teacher: "Teacher",
};

/** Roles Admin can give in the UI. */
export const ASSIGNABLE_ROLES = ["teacher", "admin"] as const;

export const DUTIES = [
  "student_records",
  "fee_collection",
  "all_class_attendance",
  "all_class_marks",
  "notices_diary",
  "timetable_edit",
  "certificates_idcards",
  "government_ids_view",
] as const;
export type Duty = (typeof DUTIES)[number];

export const DUTY_INFO: Record<Duty, { label: string; help: string }> = {
  student_records: { label: "Student records", help: "Add and edit students, guardians and enrolments" },
  fee_collection: { label: "Fee collection", help: "Collect fees and print receipts (no fee setup, no cancelling)" },
  all_class_attendance: { label: "Attendance for all classes", help: "Mark or correct attendance for any section and date" },
  all_class_marks: { label: "Marks for all classes", help: "Set up exam dates/subjects and enter marks for any class until locked" },
  notices_diary: { label: "Notices & diary", help: "Add, edit and publish diary entries and notices (no deleting)" },
  timetable_edit: { label: "Timetable", help: "Build and edit timetables" },
  certificates_idcards: { label: "Certificates & ID cards", help: "Prepare TC, bonafide and study certificates, print ID cards" },
  government_ids_view: { label: "View government IDs", help: "See full Aadhaar and other government ID numbers" },
};

/** Always Admin only, whatever duties a teacher has. */
const ADMIN_ONLY = [
  "setup.view",
  "settings.edit",
  "setup.edit",
  "assignments.edit",
  "staff.viewAll",
  "staff.edit",
  "users.manage",
  "duties.manage",
  "grading.edit",
  "fees.setup",
  "fees.cancelReceipt",
  "exams.lock",
  "records.delete",
  "audit.view",
  "students.govExport",
  "leave.approve",
] as const;

/** Module access a teacher gets from one duty (= the old Computer Staff access). */
const DUTY_CAPS = {
  "students.edit": "student_records",
  "students.govIdView": "government_ids_view",
  "fees.view": "fee_collection",
  "fees.collect": "fee_collection",
  "attendance.markAny": "all_class_attendance",
  "exams.setup": "all_class_marks",
  "marks.enterAll": "all_class_marks",
  "notices.edit": "notices_diary",
  "timetable.edit": "timetable_edit",
  "certificates.issue": "certificates_idcards",
} as const satisfies Record<string, Duty>;

export type Capability = (typeof ADMIN_ONLY)[number] | keyof typeof DUTY_CAPS;

export type Permissions = { role: AppRole; duties: readonly Duty[] };

export function can(who: Permissions | null | undefined, capability: Capability): boolean {
  if (!who) return false;
  if (who.role === "admin") return true;
  if ((ADMIN_ONLY as readonly string[]).includes(capability)) return false;
  const duty = DUTY_CAPS[capability as keyof typeof DUTY_CAPS];
  // dormant computer_staff role keeps its old access = every duty
  return who.role === "computer_staff" || who.duties.includes(duty);
}
