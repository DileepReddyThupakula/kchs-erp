/**
 * Permission model v3 (see DECISIONS.md, R13 and FA):
 *   - Roles: admin, teacher, and Office staff (database name computer_staff).
 *   - Teachers and office staff get module access only through duties granted by Admin.
 *   - FEE access (the fee_collection duty) is for the Admin and for office staff only, one by one.
 *     A teacher can never hold it, whatever other duties they have; the database refuses it.
 * This drives what the UI shows and what server actions allow; the database
 * RLS policies (public.has_duty) enforce the same rules independently.
 */
export type AppRole = "admin" | "computer_staff" | "teacher";

export const ROLE_LABELS: Record<AppRole, string> = {
  admin: "Admin",
  computer_staff: "Office staff",
  teacher: "Teacher",
};

/** Roles Admin can give in the UI. */
export const ASSIGNABLE_ROLES = ["teacher", "computer_staff", "admin"] as const;

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
  "exams.scheme",
  "records.delete",
  "audit.view",
  "students.govExport",
  "students.status",
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

/** Does this person hold the duty? Fee access is never held by a teacher (the database says the same). */
export function holdsDuty(who: { role: AppRole; duties: readonly Duty[] }, duty: Duty): boolean {
  if (who.role === "admin") return true;
  if (duty === "fee_collection" && who.role !== "computer_staff") return false;
  return who.duties.includes(duty);
}

/** Duties the Admin may tick for a person with this role (fee access: office staff only). */
export function dutiesFor(role: AppRole): readonly Duty[] {
  if (role === "admin") return [];
  return role === "computer_staff" ? DUTIES : DUTIES.filter((d) => d !== "fee_collection");
}

export function can(who: Permissions | null | undefined, capability: Capability): boolean {
  if (!who) return false;
  if (who.role === "admin") return true;
  if ((ADMIN_ONLY as readonly string[]).includes(capability)) return false;
  const duty = DUTY_CAPS[capability as keyof typeof DUTY_CAPS];
  return holdsDuty(who, duty);
}
