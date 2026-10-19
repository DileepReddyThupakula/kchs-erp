// Generated from the kchs-erp-dev schema (Supabase type generator).
// Regenerate after every migration.
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Stamps = { created_at: string; created_by: string | null; updated_at: string; updated_by: string | null };
type Writable<R, Required extends keyof R> = Partial<R> & Pick<R, Required>;
type T<R, Req extends keyof R, Rel = []> = {
  Row: R;
  Insert: Writable<R, Req>;
  Update: Partial<R>;
  Relationships: Rel extends unknown[] ? Rel : [];
};

export type AcademicYear = Stamps & {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  is_current: boolean;
};
export type AuditLog = {
  id: number;
  occurred_at: string;
  actor_user_id: string | null;
  actor_role: string | null;
  action: string;
  table_name: string | null;
  record_id: string | null;
  old_data: Json | null;
  new_data: Json | null;
  details: Json | null;
  kind: string;
};
export type CertificateTemplate = Stamps & { kind: string; title_en: string; title_te: string; texts: Json; layout_draft: boolean; wording_confirmed: boolean };
export type CertificateSettings = Stamps & { id: number; prefix_tc: string; prefix_bonafide: string; prefix_study: string; show_signature_image: boolean };
export type CertificateSeries = Stamps & { kind: string; academic_year_id: string; start_no: number; next_no: number };
export type CertificateRow = Stamps & { id: string; kind: string; academic_year_id: string; seq: number; number: string; student_id: string; status: string; language: string };
export type ClassSubject = Stamps & {
  id: string;
  academic_year_id: string;
  class_id: string;
  subject_id: string;
  is_optional: boolean;
  sort_order: number;
};
export type SchoolClass = Stamps & {
  id: string;
  name: string;
  short_name: string | null;
  sort_order: number;
  is_active: boolean;
};
export type Holiday = Stamps & {
  id: string;
  academic_year_id: string;
  date: string;
  name: string;
  kind: string;
};
export type SchoolSettings = Stamps & {
  id: number;
  name: string;
  short_name: string | null;
  logo_path: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  district: string | null;
  state: string | null;
  pincode: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  board: string | null;
  affiliation_no: string | null;
  udise_code: string | null;
  principal_name: string | null;
  principal_signature_path: string | null;
  timezone: string;
  mediums: string[];
  working_days: number[];
  low_attendance_pct: number;
  circular_prefix: string | null;
  diary_deadline: string;
  default_pass_percent: number;
  staff_group_name: string | null;
  translation_monthly_cap: number;
  second_saturday_holiday: boolean;
  periods_per_day: number;
  admission_no_prefix: string;
  receipt_no_prefix: string;
  extra: Json;
};
export type Section = Stamps & {
  id: string;
  academic_year_id: string;
  class_id: string;
  name: string;
  medium: string | null;
  room: string | null;
  capacity: number | null;
  class_teacher_id: string | null;
  parents_group_name: string | null;
};
export type AppRole = "admin" | "computer_staff" | "teacher";
export type Staff = Stamps & {
  id: string;
  user_id: string | null;
  app_role: AppRole | null;
  employee_code: string;
  full_name: string;
  gender: string | null;
  dob: string | null;
  phone: string | null;
  email: string | null;
  designation: string | null;
  department: string | null;
  qualification: string | null;
  date_of_joining: string | null;
  address: string | null;
  photo_path: string | null;
  status: string;
};
export type StaffDuty =
  | "student_records"
  | "fee_collection"
  | "all_class_attendance"
  | "all_class_marks"
  | "notices_diary"
  | "timetable_edit"
  | "certificates_idcards"
  | "government_ids_view";
export type StaffPermission = {
  id: string;
  staff_id: string;
  duty: StaffDuty;
  granted_by: string | null;
  granted_at: string;
};
export type FieldType = "text" | "number" | "date" | "boolean" | "select" | "multiselect";
export type StudentFieldDefinition = Stamps & {
  key: string;
  label: string;
  field_group: "identity" | "social" | "disability" | "enrolment" | "previous_school" | "facilities" | "other";
  field_type: FieldType;
  options: string[] | null;
  pattern: string | null;
  help: string | null;
  required_for_gov: boolean;
  sensitive: boolean;
  reveal_with_duty: boolean;
  sort_order: number;
  is_active: boolean;
};
export type StudentDocumentType = Stamps & { code: string; label: string; required: boolean; sort_order: number; is_active: boolean };
export type StudentStatus = "active" | "left" | "tc_issued" | "passed_out";
export type Student = Stamps & {
  id: string;
  admission_no: string;
  full_name: string;
  gender: "male" | "female" | "other";
  date_of_birth: string;
  admission_date: string;
  address: string | null;
  village_town: string | null;
  district: string | null;
  pincode: string | null;
  photo_path: string | null;
  status: StudentStatus;
  status_date: string | null;
  status_reason: string | null;
  is_demo: boolean;
};
export type StudentProfile = Stamps & { student_id: string; details: Record<string, Json> };
/** value_enc is never selectable through the API. */
export type StudentSecureValue = { student_id: string; field_key: string; value_last4: string; updated_at: string };
export type Guardian = Stamps & {
  id: string;
  full_name: string;
  phone: string | null;
  alt_phone: string | null;
  email: string | null;
  occupation: string | null;
  education: string | null;
  address: string | null;
  pincode: string | null;
  is_demo: boolean;
};
export type GuardianRelation = "father" | "mother" | "guardian" | "grandparent" | "sibling" | "other";
export type StudentGuardian = Stamps & { id: string; student_id: string; guardian_id: string; relation: GuardianRelation; is_primary: boolean };
export type EnrollmentStatus = "active" | "promoted" | "detained" | "left";
export type StudentEnrollment = Stamps & {
  id: string;
  student_id: string;
  academic_year_id: string;
  section_id: string;
  roll_no: number | null;
  status: EnrollmentStatus;
};
export type StudentDocument = Stamps & {
  id: string;
  student_id: string;
  doc_type: string;
  file_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
};
export type FeeHead = Stamps & { id: string; name: string; code: string | null; sort_order: number; is_active: boolean; late_fee_rule: Json | null };
export type FeePlanKind = "one_time" | "monthly" | "custom";
export type FeePlan = Stamps & { id: string; academic_year_id: string; name: string; kind: FeePlanKind; due_day: number; is_active: boolean; is_demo: boolean };
export type FeePlanInstallment = Stamps & {
  id: string;
  plan_id: string;
  seq: number;
  label: string;
  due_date: string;
  period_month: string | null;
  share_bp: number | null;
  amount_paise: number | null;
};
export type FeeStructure = Stamps & {
  id: string;
  academic_year_id: string;
  class_id: string;
  fee_head_id: string;
  amount_paise: number;
  default_plan_id: string | null;
};
export type StudentFeePlan = Stamps & { id: string; student_id: string; academic_year_id: string; fee_head_id: string; plan_id: string; reason: string };
export type FeeConcession = Stamps & {
  id: string;
  student_id: string;
  academic_year_id: string;
  fee_head_id: string | null;
  kind: "fixed" | "percent";
  amount_paise: number | null;
  percent_bp: number | null;
  reason: string;
};
export type StudentFeeDue = Stamps & {
  id: string;
  student_id: string;
  academic_year_id: string;
  fee_head_id: string;
  plan_id: string;
  installment_seq: number;
  label: string;
  due_date: string;
  amount_paise: number;
  concession_paise: number;
  paid_paise: number;
  voided_at: string | null;
};
export type PaymentMode = "cash" | "upi" | "cheque" | "bank_transfer";
export type FeeReceipt = Stamps & {
  id: string;
  receipt_no: string;
  financial_year: string;
  seq: number;
  receipt_date: string;
  student_id: string | null;
  total_paise: number;
  payment_mode: PaymentMode;
  reference_no: string | null;
  notes: string | null;
  collected_by: string;
  status: "valid" | "cancelled";
  cancelled_by: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  is_demo: boolean;
  kind: "dues" | "misc";
  payer_name: string | null;
};
export type FeeReceiptItem = Stamps & { id: string; receipt_id: string; due_id: string | null; fee_head_id: string; amount_paise: number; fine_paise: number };
export type FeeCampaign = Stamps & {
  id: string;
  academic_year_id: string;
  fee_head_id: string;
  plan_id: string;
  name: string;
  description: string | null;
  amount_mode: "flat" | "per_class";
  amount_paise: number | null;
  audience: "all" | "classes" | "sections" | "students";
  audience_ids: string[];
  apply_concessions: boolean;
  status: "active" | "cancelled";
  cancelled_at: string | null;
  cancel_reason: string | null;
  is_demo: boolean;
};
export type FeeSettings = Stamps & {
  id: number;
  upi_id: string | null;
  payee_name: string | null;
  qr_path: string | null;
  require_upi_reference: boolean;
  changed_by_name: string | null;
};
export type FeeCampaignClassAmount = Stamps & { campaign_id: string; class_id: string; amount_paise: number };
export type FeeCampaignStudent = Stamps & { campaign_id: string; student_id: string };
export type Subject = Stamps & {
  id: string;
  name: string;
  code: string | null;
  type: string;
  sort_order: number;
  is_active: boolean;
  name_te: string | null;
  name_te_verified: boolean;
};
export type TeacherAssignment = Stamps & {
  id: string;
  staff_id: string;
  section_id: string;
  subject_id: string;
  periods_per_week: number | null;
};

type FK<Name extends string, Col extends string, Ref extends string> = {
  foreignKeyName: Name;
  columns: [Col];
  isOneToOne: false;
  referencedRelation: Ref;
  referencedColumns: ["id"];
};

export type BellSchedule = Stamps & { id: string; name: string; note: string | null; is_default: boolean };
export type BellPeriod = Stamps & {
  id: string;
  schedule_id: string;
  seq: number;
  kind: "teaching" | "break" | "lunch";
  period_no: number | null;
  label: string | null;
  start_time: string;
  end_time: string;
};
export type ClassBellSchedule = Stamps & { class_id: string; weekday: number; schedule_id: string };
export type TimetableEntry = Stamps & {
  id: string;
  academic_year_id: string;
  section_id: string;
  weekday: number;
  period_no: number;
  subject_id: string | null;
  activity: string | null;
  teacher_id: string | null;
  room: string | null;
  is_demo: boolean;
};
export type TimetableSubstitution = Stamps & {
  id: string;
  sub_date: string;
  section_id: string;
  period_no: number;
  original_teacher_id: string;
  substitute_teacher_id: string;
  reason: string | null;
  entered_by: string | null;
  is_demo: boolean;
};
export type TimetablePeriodCount = {
  assignment_id: string;
  section_id: string;
  subject_id: string;
  staff_id: string;
  target: number | null;
  scheduled: number;
  difference: number | null;
  status: "over" | "under" | "ok" | "no_target";
};
export type MyWeekRow = {
  on_date: string;
  weekday: number;
  period_no: number;
  kind: "regular" | "substituted_out" | "substitute_in";
  section_id: string;
  section_label: string;
  subject_name: string | null;
  activity: string | null;
  room: string | null;
  start_time: string | null;
  end_time: string | null;
  other_name: string | null;
  reason: string | null;
};

export type AttendanceSession = Stamps & {
  id: string;
  academic_year_id: string;
  section_id: string;
  att_date: string;
  session: "morning" | "afternoon";
  period_no: number | null;
  assigned_to: string | null;
  marked_by: string | null;
  marked_at: string;
  kind: "regular" | "substitute" | "correction";
  status: string;
  is_demo: boolean;
};
export type StudentAttendanceRow = Stamps & {
  id: string;
  session_id: string;
  student_id: string;
  att_date: string;
  session: "morning" | "afternoon";
  status: "present" | "absent" | "late";
  note: string | null;
  marked_by: string | null;
  is_demo: boolean;
};
export type AttendanceDaily = {
  student_id: string;
  att_date: string;
  morning: string | null;
  afternoon: string | null;
  sessions_marked: number;
  sessions_attended: number;
  day_status: "present" | "absent" | "morning_only" | "afternoon_only" | "one_session_present" | "one_session_absent";
};
export type LeaveType = Stamps & { id: string; name: string; default_days: number | null; is_active: boolean; sort_order: number };
export type LeaveBalanceRow = Stamps & { id: string; staff_id: string; leave_type_id: string; academic_year_id: string; allowance_days: number | null };
export type LeaveRequest = Stamps & {
  id: string;
  staff_id: string;
  leave_type_id: string;
  from_date: string;
  to_date: string;
  days: number;
  reason: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  decided_by: string | null;
  decided_at: string | null;
  decision_note: string | null;
  is_demo: boolean;
};
export type StaffAttendanceRow = Stamps & {
  id: string;
  staff_id: string;
  att_date: string;
  status: "present" | "absent" | "late" | "on_leave";
  note: string | null;
  marked_by: string | null;
  is_demo: boolean;
};

export type DiaryEntry = Stamps & {
  id: string;
  academic_year_id: string;
  entry_date: string;
  subject_id: string | null;
  body: string;
  body_te: string | null;
  te_status: "none" | "pending" | "auto" | "reviewed";
  te_src_hash: string | null;
  author_id: string | null;
  kind: "subject" | "remark";
  submitted_at: string | null;
  status: "draft" | "submitted" | "published";
  published_at: string | null;
  published_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  is_demo: boolean;
};
export type TranslationCacheRow = { hash: string; text_te: string; chars: number; created_at: string };
export type TranslationUsageRow = { month: string; chars: number };
export type NoticeSend = Stamps & { id: string; notice_id: string; group_key: string; group_label: string; status: "opened" | "marked_sent"; opened_by: string | null; opened_at: string | null; marked_by: string | null; marked_at: string | null };
export type DiarySkip = Stamps & { id: string; section_id: string; entry_date: string; subject_id: string; skipped_by: string | null };
export type DiaryReminder = Stamps & { id: string; teacher_id: string; section_id: string; entry_date: string; subject_id: string | null; reminded_by: string | null };
export type MessageLogRow = Stamps & {
  id: string;
  kind: "diary" | "notice" | "fee_due" | "absence" | "other";
  target: "group" | "student";
  student_id: string | null;
  section_id: string | null;
  ref_date: string | null;
  channel: "app" | "web" | "share" | "copy" | "download" | "print";
  status: "opened" | "marked_sent" | "skipped";
  summary: string | null;
  actor_id: string | null;
};
export type DiaryEntrySection = { entry_id: string; section_id: string };
export type FileMeta = Stamps & { id: string; file_path: string; file_name: string; mime_type: string; size_bytes: number };
export type DiaryAttachment = FileMeta & { entry_id: string };
export type NoticeRow = Stamps & {
  id: string;
  academic_year_id: string;
  circular_seq: number | null;
  circular_no: string | null;
  title: string;
  body: string;
  title_te: string | null;
  body_te: string | null;
  te_status: "none" | "pending" | "auto" | "reviewed";
  te_src_hash: string | null;
  audience: "all" | "roles" | "classes" | "teachers" | "parents_all" | "parents_classes";
  publish_date: string;
  expires_on: string | null;
  important: boolean;
  status: "draft" | "published";
  published_at: string | null;
  published_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  is_demo: boolean;
};
export type NoticeAudienceRow = { id: string; notice_id: string; role: AppRole | null; class_id: string | null; staff_id: string | null };
export type NoticeAttachment = FileMeta & { notice_id: string };
export type NoticeRead = { notice_id: string; staff_id: string; read_at: string };

// ---- exams & marks
export type GradeBand = Stamps & { id: string; grade: string; min_pct: number; max_pct: number; grade_point: number; is_fail: boolean };
export type DescriptiveGrade = Stamps & { code: string; label: string; sort_order: number };
export type RemarkBankRow = Stamps & { id: string; text_en: string; text_te: string | null; te_verified: boolean; sort_order: number; is_active: boolean };
export type ExamClassMode = Stamps & { academic_year_id: string; class_id: string; mode: "marks" | "grades" | "remarks" };
export type ExamComponent = Stamps & { id: string; academic_year_id: string; class_id: string; name: string; max_marks: number; sort_order: number; locked_at: string | null; locked_by: string | null; lock_note: string | null; is_demo: boolean };
export type ExamSubjectMax = Stamps & { component_id: string; subject_id: string; max_marks: number };
export type ResultGroup = Stamps & { id: string; academic_year_id: string; class_id: string; name: string; kind: "part" | "term" | "final"; method: "sum" | "average" | "best_n"; best_n: number | null; scale_to: number | null; start_date: string | null; end_date: string | null; sort_order: number; locked_at: string | null; locked_by: string | null; is_demo: boolean };
export type ResultGroupMember = Stamps & { id: string; group_id: string; component_id: string | null; child_group_id: string | null; scale_to: number | null; sort_order: number };
export type SubjectPassMark = Stamps & { academic_year_id: string; class_id: string; subject_id: string; pass_percent: number };
export type MarkRow = Stamps & { id: string; academic_year_id: string; class_id: string; section_id: string; student_id: string; component_id: string; subject_id: string; status: "marked" | "absent" | "na"; marks: number | null; entered_by: string | null; is_demo: boolean };
export type SubjectResult = { id: string; academic_year_id: string; class_id: string; section_id: string; student_id: string; group_id: string; subject_id: string; scored: number; max_marks: number; pct: number; grade: string | null; grade_point: number | null; pass_percent: number; passed: boolean; has_absent: boolean; missing: number; locked: boolean; updated_at: string };
export type StudentResult = { id: string; academic_year_id: string; class_id: string; section_id: string; student_id: string; group_id: string; scored: number; max_marks: number; pct: number; grade: string | null; grade_point: number | null; result: "pass" | "fail" | "incomplete"; subjects_count: number; failed_count: number; locked: boolean; updated_at: string };
export type GradeEntry = Stamps & { id: string; academic_year_id: string; class_id: string; section_id: string; student_id: string; group_id: string; subject_id: string; grade: string | null; remark: string | null; entered_by: string | null; is_demo: boolean };
export type ReportRemark = Stamps & { id: string; academic_year_id: string; class_id: string; section_id: string; student_id: string; group_id: string; bank_id: string | null; remark_en: string; remark_te: string | null; entered_by: string | null; is_demo: boolean };
export type ReportCardPrint = Stamps & { id: string; student_id: string; group_id: string; section_id: string | null; printed_by: string | null; printed_at: string; duplicate: boolean };

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: {
    Tables: {
      academic_years: T<AcademicYear, "name" | "start_date" | "end_date">;
      audit_logs: T<AuditLog, "action">;
      certificate_templates: T<CertificateTemplate, "kind">;
      certificate_settings: T<CertificateSettings, "id">;
      certificate_series: T<CertificateSeries, "kind" | "academic_year_id">;
      certificates: T<CertificateRow, "kind" | "number">;
      class_subjects: T<
        ClassSubject,
        "academic_year_id" | "class_id" | "subject_id",
        [
          FK<"class_subjects_academic_year_id_fkey", "academic_year_id", "academic_years">,
          FK<"class_subjects_class_id_fkey", "class_id", "classes">,
          FK<"class_subjects_subject_id_fkey", "subject_id", "subjects">,
        ]
      >;
      classes: T<SchoolClass, "name">;
      holidays: T<
        Holiday,
        "academic_year_id" | "date" | "name",
        [FK<"holidays_academic_year_id_fkey", "academic_year_id", "academic_years">]
      >;
      school_settings: T<SchoolSettings, never>;
      sections: T<
        Section,
        "academic_year_id" | "class_id" | "name",
        [
          FK<"sections_academic_year_id_fkey", "academic_year_id", "academic_years">,
          FK<"sections_class_id_fkey", "class_id", "classes">,
          FK<"sections_class_teacher_id_fkey", "class_teacher_id", "staff">,
        ]
      >;
      staff: T<Staff, "employee_code" | "full_name">;
      staff_permissions: T<
        StaffPermission,
        "staff_id" | "duty",
        [FK<"staff_permissions_staff_id_fkey", "staff_id", "staff">]
      >;
      subjects: T<Subject, "name">;
      fee_heads: T<FeeHead, "name">;
      fee_plans: T<FeePlan, "academic_year_id" | "name" | "kind", [FK<"fee_plans_academic_year_id_fkey", "academic_year_id", "academic_years">]>;
      fee_plan_installments: T<FeePlanInstallment, "plan_id" | "seq" | "label" | "due_date", [FK<"fee_plan_installments_plan_id_fkey", "plan_id", "fee_plans">]>;
      fee_structure: T<FeeStructure, "academic_year_id" | "class_id" | "fee_head_id", [FK<"fee_structure_fee_head_id_fkey", "fee_head_id", "fee_heads">, FK<"fee_structure_class_id_fkey", "class_id", "classes">]>;
      student_fee_plans: T<StudentFeePlan, "student_id" | "academic_year_id" | "fee_head_id" | "plan_id" | "reason">;
      fee_concessions: T<
        FeeConcession,
        "student_id" | "academic_year_id" | "kind" | "reason",
        [FK<"fee_concessions_student_id_fkey", "student_id", "students">, FK<"fee_concessions_fee_head_id_fkey", "fee_head_id", "fee_heads">]
      >;
      student_fee_dues: T<
        StudentFeeDue,
        "student_id" | "academic_year_id" | "fee_head_id" | "plan_id" | "installment_seq" | "label" | "due_date" | "amount_paise",
        [FK<"student_fee_dues_student_id_fkey", "student_id", "students">, FK<"student_fee_dues_fee_head_id_fkey", "fee_head_id", "fee_heads">]
      >;
      fee_receipts: T<
        FeeReceipt,
        "receipt_no" | "financial_year" | "seq" | "receipt_date" | "total_paise" | "payment_mode" | "collected_by",
        [FK<"fee_receipts_student_id_fkey", "student_id", "students">, FK<"fee_receipts_collected_by_fkey", "collected_by", "staff">]
      >;
      fee_receipt_items: T<
        FeeReceiptItem,
        "receipt_id" | "fee_head_id" | "amount_paise",
        [FK<"fee_receipt_items_receipt_id_fkey", "receipt_id", "fee_receipts">, FK<"fee_receipt_items_fee_head_id_fkey", "fee_head_id", "fee_heads">]
      >;
      fee_campaigns: T<
        FeeCampaign,
        "academic_year_id" | "fee_head_id" | "plan_id" | "name" | "amount_mode" | "audience",
        [FK<"fee_campaigns_fee_head_id_fkey", "fee_head_id", "fee_heads">, FK<"fee_campaigns_plan_id_fkey", "plan_id", "fee_plans">]
      >;
      fee_settings: T<FeeSettings, never>;
      fee_campaign_class_amounts: T<FeeCampaignClassAmount, "campaign_id" | "class_id" | "amount_paise">;
      fee_campaign_students: T<FeeCampaignStudent, "campaign_id" | "student_id">;
      student_field_definitions: T<StudentFieldDefinition, "key" | "label" | "field_group" | "field_type">;
      student_document_types: T<StudentDocumentType, "code" | "label">;
      students: T<Student, "full_name" | "gender" | "date_of_birth">;
      student_profiles: T<StudentProfile, "student_id", [FK<"student_profiles_student_id_fkey", "student_id", "students">]>;
      student_secure_values: {
        Row: StudentSecureValue;
        Insert: never;
        Update: never;
        Relationships: [FK<"student_secure_values_student_id_fkey", "student_id", "students">];
      };
      guardians: T<Guardian, "full_name">;
      student_guardians: T<
        StudentGuardian,
        "student_id" | "guardian_id" | "relation",
        [FK<"student_guardians_student_id_fkey", "student_id", "students">, FK<"student_guardians_guardian_id_fkey", "guardian_id", "guardians">]
      >;
      student_enrollments: T<
        StudentEnrollment,
        "student_id" | "academic_year_id" | "section_id",
        [
          FK<"student_enrollments_student_id_fkey", "student_id", "students">,
          FK<"student_enrollments_section_id_fkey", "section_id", "sections">,
          FK<"student_enrollments_academic_year_id_fkey", "academic_year_id", "academic_years">,
        ]
      >;
      student_documents: T<StudentDocument, "student_id" | "doc_type" | "file_path" | "file_name" | "mime_type" | "size_bytes", [FK<"student_documents_student_id_fkey", "student_id", "students">]>;
      diary_entries: T<DiaryEntry, "academic_year_id" | "entry_date" | "body">;
      diary_entry_sections: T<DiaryEntrySection, "entry_id" | "section_id">;
      translation_cache: T<TranslationCacheRow, "hash" | "text_te" | "chars">;
      translation_usage: T<TranslationUsageRow, "month">;
      grade_bands: T<GradeBand, "grade" | "min_pct" | "max_pct" | "grade_point">;
      descriptive_grades: T<DescriptiveGrade, "code" | "label">;
      remark_bank: T<RemarkBankRow, "text_en">;
      exam_class_modes: T<ExamClassMode, "academic_year_id" | "class_id" | "mode">;
      exam_components: T<ExamComponent, "academic_year_id" | "class_id" | "name" | "max_marks">;
      exam_subject_max: T<ExamSubjectMax, "component_id" | "subject_id" | "max_marks">;
      result_groups: T<ResultGroup, "academic_year_id" | "class_id" | "name">;
      result_group_members: T<ResultGroupMember, "group_id">;
      subject_pass_marks: T<SubjectPassMark, "academic_year_id" | "class_id" | "subject_id" | "pass_percent">;
      marks: T<MarkRow, "academic_year_id" | "class_id" | "section_id" | "student_id" | "component_id" | "subject_id">;
      subject_results: T<SubjectResult, "academic_year_id" | "class_id" | "section_id" | "student_id" | "group_id" | "subject_id" | "scored" | "max_marks" | "pct" | "pass_percent" | "passed">;
      student_results: T<StudentResult, "academic_year_id" | "class_id" | "section_id" | "student_id" | "group_id" | "scored" | "max_marks" | "pct" | "result" | "subjects_count" | "failed_count">;
      grade_entries: T<GradeEntry, "academic_year_id" | "class_id" | "section_id" | "student_id" | "group_id" | "subject_id">;
      report_remarks: T<ReportRemark, "academic_year_id" | "class_id" | "section_id" | "student_id" | "group_id" | "remark_en">;
      report_card_prints: T<ReportCardPrint, "student_id" | "group_id">;
      notice_sends: T<NoticeSend, "notice_id" | "group_key" | "group_label">;
      diary_skips: T<DiarySkip, "section_id" | "entry_date" | "subject_id">;
      diary_reminders: T<DiaryReminder, "teacher_id" | "section_id" | "entry_date">;
      message_log: T<MessageLogRow, "kind" | "target">;
      diary_attachments: T<DiaryAttachment, "entry_id" | "file_path" | "file_name" | "mime_type" | "size_bytes">;
      notices: T<NoticeRow, "academic_year_id" | "title" | "body" | "audience">;
      notice_audience: T<NoticeAudienceRow, "notice_id">;
      notice_attachments: T<NoticeAttachment, "notice_id" | "file_path" | "file_name" | "mime_type" | "size_bytes">;
      notice_reads: T<NoticeRead, "notice_id" | "staff_id">;
      attendance_sessions: T<AttendanceSession, "academic_year_id" | "section_id" | "att_date" | "session" | "kind">;
      student_attendance: T<StudentAttendanceRow, "session_id" | "student_id" | "status">;
      leave_types: T<LeaveType, "name">;
      leave_balances: T<LeaveBalanceRow, "staff_id" | "leave_type_id" | "academic_year_id">;
      leave_requests: T<LeaveRequest, "staff_id" | "leave_type_id" | "from_date" | "to_date" | "reason">;
      staff_attendance: T<StaffAttendanceRow, "staff_id" | "att_date" | "status">;
      bell_schedules: T<BellSchedule, "name">;
      bell_periods: T<BellPeriod, "schedule_id" | "seq" | "kind" | "start_time" | "end_time">;
      class_bell_schedules: T<ClassBellSchedule, "class_id" | "weekday" | "schedule_id">;
      timetable_entries: T<TimetableEntry, "section_id" | "weekday" | "period_no">;
      timetable_substitutions: T<TimetableSubstitution, "sub_date" | "section_id" | "period_no" | "original_teacher_id" | "substitute_teacher_id">;
      teacher_assignments: T<
        TeacherAssignment,
        "staff_id" | "section_id" | "subject_id",
        [
          FK<"teacher_assignments_section_id_fkey", "section_id", "sections">,
          FK<"teacher_assignments_staff_id_fkey", "staff_id", "staff">,
          FK<"teacher_assignments_subject_id_fkey", "subject_id", "subjects">,
        ]
      >;
    };
    Views: {
      timetable_period_counts: { Row: TimetablePeriodCount; Relationships: [] };
      attendance_daily: { Row: AttendanceDaily; Relationships: [] };
    };
    Functions: {
      generate_second_saturdays: { Args: { p_year_id: string }; Returns: number };
      log_event: {
        Args: { p_action: string; p_details?: Json; p_record_id?: string; p_table?: string };
        Returns: undefined;
      };
      my_role: { Args: never; Returns: AppRole };
      has_duty: { Args: { p_duty: StaffDuty }; Returns: boolean };
      my_duties: { Args: never; Returns: StaffDuty[] };
      public_branding: { Args: never; Returns: { logo_path: string; name: string; short_name: string; motto: string | null }[] };
      set_student_secure_value: { Args: { p_student_id: string; p_field_key: string; p_value: string }; Returns: undefined };
      reveal_student_secure_values: { Args: { p_student_id: string }; Returns: { field_key: string; label: string; value: string }[] };
      save_student: { Args: { p: Json }; Returns: string };
      collect_fee: {
        Args: { p_student_id: string; p_amount_paise: number; p_mode: string; p_reference?: string; p_notes?: string; p_due_ids?: string[]; p_receipt_date?: string };
        Returns: string;
      };
      cancel_fee_receipt: { Args: { p_receipt_id: string; p_reason: string }; Returns: undefined };
      regenerate_fee_dues: { Args: { p_year: string; p_student?: string }; Returns: number };
      create_special_fee: { Args: { p: Json }; Returns: string };
      update_special_fee: { Args: { p_id: string; p: Json }; Returns: undefined };
      add_special_fee_students: { Args: { p_id: string; p_student_ids: string[] }; Returns: number };
      cancel_special_fee: { Args: { p_id: string; p_reason: string }; Returns: number };
      create_misc_receipt: {
        Args: { p_fee_head_id: string; p_amount_paise: number; p_mode: string; p_reference?: string; p_student_id?: string; p_payer_name?: string; p_notes?: string; p_receipt_date?: string };
        Returns: string;
      };
      subject_names: { Args: never; Returns: { id: string; name: string; name_te: string | null }[] };
      apply_notice_translation: { Args: { p_notice: string; p_title_te: string; p_body_te: string; p_hash: string }; Returns: boolean };
      notice_send_list: { Args: { p_notice: string }; Returns: { group_key: string; group_label: string; status: string; opened_by_name: string | null; opened_at: string | null; marked_by_name: string | null; marked_at: string | null }[] };
      notice_send_open: { Args: { p_notice: string; p_key: string; p_channel: string }; Returns: undefined };
      notice_send_mark: { Args: { p_notice: string; p_key: string; p_sent: boolean }; Returns: undefined };
      notice_send_counts: { Args: never; Returns: { notice_id: string; sent: number; total: number }[] };
      save_exam_component: { Args: { p: Json }; Returns: string };
      delete_exam_component: { Args: { p_id: string }; Returns: undefined };
      set_subject_max: { Args: { p_component: string; p_subject: string; p_max: number | null }; Returns: undefined };
      save_result_group: { Args: { p: Json }; Returns: string };
      delete_result_group: { Args: { p_id: string }; Returns: undefined };
      set_pass_mark: { Args: { p_year: string; p_class: string; p_subject: string; p_percent: number | null }; Returns: undefined };
      set_class_mode: { Args: { p_year: string; p_class: string; p_mode: string }; Returns: undefined };
      save_grade_bands: { Args: { p: Json }; Returns: undefined };
      save_descriptive_grades: { Args: { p: Json }; Returns: undefined };
      save_remark_bank: { Args: { p: Json }; Returns: undefined };
      apply_default_scheme: { Args: { p_year: string; p_class: string }; Returns: undefined };
      lock_result_group: { Args: { p_group: string }; Returns: undefined };
      lock_exam_component: { Args: { p_component: string }; Returns: undefined };
      unlock_exam_component: { Args: { p_component: string; p_reason: string }; Returns: undefined };
      unlock_result_group: { Args: { p_group: string; p_reason: string }; Returns: undefined };
      students_page: { Args: { p_year: string; p_q?: string; p_class?: string; p_section?: string; p_status?: string; p_docs?: string; p_gov?: string; p_enrol?: string; p_mine?: boolean; p_sort?: string; p_dir?: string; p_offset?: number; p_limit?: number; p_ids?: string[]; p_full?: boolean }; Returns: Json };
      report_strength: { Args: { p_year: string }; Returns: { section_id: string; class_name: string; class_order: number; section_name: string; active: number; boys: number; girls: number; other: number; left_school: number }[] };
      report_demographics: { Args: { p_year: string }; Returns: { class_name: string; class_order: number; social_category: string; religion: string; students: number }[] };
      report_admissions: { Args: { p_year: string; p_from: string; p_to: string }; Returns: { kind: string; student_id: string; admission_no: string; full_name: string; class_name: string | null; section_name: string | null; on_date: string | null; status: string }[] };
      report_fee_dues_by_class: { Args: { p_year: string; p_upto?: string }; Returns: { class_name: string; class_order: number; students: number; billed_paise: number; paid_paise: number; overdue_paise: number }[] };
      report_fee_defaulters: { Args: { p_year: string; p_upto?: string; p_min_paise?: number }; Returns: { student_id: string; admission_no: string; full_name: string; class_name: string; section_name: string; overdue_paise: number; oldest_due: string; installments: number }[] };
      report_fee_collection_monthly: { Args: { p_year: string }; Returns: { month: string; receipts: number; collected_paise: number; cash_paise: number; upi_paise: number; cheque_paise: number; bank_paise: number; cancelled: number; cancelled_paise: number }[] };
      report_fee_concessions: { Args: { p_year: string }; Returns: { fee_head: string; kind: string; students: number; total_paise: number }[] };
      report_class_results: { Args: { p_group: string }; Returns: { section_id: string; class_name: string; section_name: string; students: number; passed: number; failed: number; incomplete: number; avg_pct: number | null; grades: Json }[] };
      report_subject_results: { Args: { p_group: string }; Returns: { section_id: string; class_name: string; section_name: string; subject_name: string; students: number; passed: number; failed: number; incomplete: number; avg_pct: number | null }[] };
      report_staff_attendance: { Args: { p_from: string; p_to: string }; Returns: { staff_id: string; full_name: string; present: number; late: number; absent: number; on_leave: number; unmarked: number }[] };
      report_my_load: { Args: { p_year: string; p_today?: string }; Returns: Json };
      log_report: { Args: { p_report: string; p_format: string; p_filters?: Json; p_rows?: number }; Returns: undefined };
      staff_dashboard: { Args: { p_year: string; p_today: string }; Returns: Json };
      collect_page: { Args: { p_year: string; p_today: string }; Returns: Json };
      marks_page: { Args: { p_year: string; p_section?: string; p_component?: string; p_subject?: string }; Returns: Json };
      results_page: { Args: { p_year: string; p_section?: string; p_group?: string }; Returns: Json };
      audit_entries: { Args: { p_from?: string; p_to?: string; p_actor?: string; p_group?: string; p_table?: string; p_record?: string; p_search?: string; p_limit?: number; p_offset?: number; p_alert?: string }; Returns: Json };
      audit_record_history: { Args: { p_table: string; p_record: string; p_limit?: number }; Returns: Json };
      audit_actors: { Args: Record<string, never>; Returns: Json };
      audit_export: { Args: { p_format: string; p_from?: string; p_to?: string; p_actor?: string; p_group?: string; p_table?: string; p_record?: string; p_search?: string; p_alert?: string }; Returns: Json };
      rollover_preview: { Args: { p_from: string; p_to: string; p_plan?: Json }; Returns: Json };
      rollover_confirm: { Args: { p_from: string; p_to: string; p_plan: Json; p_checked: boolean; p_typed_name: string }; Returns: Json };
      rollover_undo_check: { Args: { p_run: string }; Returns: Json };
      rollover_undo: { Args: { p_run: string }; Returns: Json };
      rollover_runs_list: { Args: Record<string, never>; Returns: Json };
      previous_year_balance: { Args: { p_student: string; p_year?: string }; Returns: Json };
      certificate_checklist: { Args: { p_student: string; p_leaving?: string }; Returns: Json };
      certificate_preview: { Args: { p_kind: string; p_student: string; p_language: string; p_data?: Json }; Returns: Json };
      certificate_issue: { Args: { p_kind: string; p_student: string; p_language: string; p_data: Json; p_override?: boolean; p_override_reason?: string }; Returns: Json };
      certificate_print: { Args: { p_certificate: string; p_language?: string; p_reason?: string; p_note?: string }; Returns: Json };
      certificate_print_data: { Args: { p_certificate: string; p_copy?: number; p_language?: string }; Returns: Json };
      certificate_cancel_check: { Args: { p_certificate: string }; Returns: Json };
      certificate_cancel: { Args: { p_certificate: string; p_reason: string; p_section?: string }; Returns: Json };
      certificate_register: { Args: { p_kind: string; p_year: string; p_limit?: number; p_offset?: number }; Returns: Json };
      certificate_register_export: { Args: { p_kind: string; p_year: string; p_format: string }; Returns: Json };
      certificates_for_student: { Args: { p_student: string }; Returns: Json };
      certificate_set_start: { Args: { p_kind: string; p_year: string; p_start: number }; Returns: undefined };
      certificate_settings_save: { Args: { p_prefix_tc: string; p_prefix_bonafide: string; p_prefix_study: string }; Returns: undefined };
      certificate_signature_image: { Args: { p_on: boolean }; Returns: undefined };
      certificate_template_save: { Args: { p_kind: string; p_key: string; p_en: string; p_te: string }; Returns: undefined };
      certificate_template_confirm_telugu: { Args: { p_kind: string; p_key?: string }; Returns: undefined };
      certificate_template_set_draft: { Args: { p_kind: string; p_layout_draft: boolean; p_wording_confirmed?: boolean }; Returns: undefined };
      certificate_print_state: { Args: { p_certificate: string }; Returns: Json };
      certificate_student_search: { Args: { p_q: string; p_kind?: string }; Returns: Json };
      certificate_school_check: { Args: Record<string, never>; Returns: Json };
      audit_alerts: { Args: { p_days?: number }; Returns: Json };
      log_failed_login: { Args: { p_email: string }; Returns: undefined };
      admin_dashboard: { Args: { p_year: string; p_today: string }; Returns: Json };
      notice_read_counts: { Args: never; Returns: { notice_id: string; read_count: number; total: number }[] };
      subject_result_calc: { Args: { p_student: string; p_group: string; p_subject: string }; Returns: Json };
      exam_pending: { Args: { p_component: string }; Returns: { section_id: string; subject_id: string; pending: number }[] };
      save_marks: { Args: { p_component: string; p_section: string; p_subject: string; p_rows: Json }; Returns: number };
      clear_mark: { Args: { p_component: string; p_student: string; p_subject: string }; Returns: undefined };
      save_grades: { Args: { p_group: string; p_section: string; p_subject: string; p_rows: Json }; Returns: number };
      save_report_remark: { Args: { p_group: string; p_student: string; p_bank: string | null; p_en: string | null; p_te: string | null }; Returns: undefined };
      report_card_data: { Args: { p_student: string; p_group: string; p_log?: boolean }; Returns: Json };
      class_result_list: { Args: { p_section: string; p_group: string }; Returns: { student_id: string; full_name: string; roll_no: number | null; scored: number | null; max_marks: number | null; pct: number | null; grade: string | null; result: string | null; printed: number }[] };
      translation_reserve: { Args: { p_chars: number }; Returns: boolean };
      translation_status: { Args: never; Returns: { used: number; cap: number }[] };
      apply_diary_translation: { Args: { p_entry: string; p_te: string; p_hash: string }; Returns: boolean };
      save_diary: { Args: { p: Json }; Returns: string };
      save_diary_day: { Args: { p_date: string; p_section_ids: string[]; p_items: Json; p_publish?: boolean }; Returns: string[] };
      set_diary_status: { Args: { p_id: string; p_status: string }; Returns: undefined };
      submit_diary: { Args: { p: Json }; Returns: string };
      admin_save_diary_line: { Args: { p: Json }; Returns: string };
      publish_class_diary: { Args: { p_section: string; p_date: string }; Returns: number };
      publish_all_complete: { Args: { p_date: string }; Returns: number };
      unpublish_class_diary: { Args: { p_section: string; p_date: string }; Returns: number };
      skip_diary_subject: { Args: { p_section: string; p_date: string; p_subject: string; p_skip: boolean }; Returns: undefined };
      remind_diary: { Args: { p_section: string; p_date: string; p_subject: string | null }; Returns: number };
      diary_board: { Args: { p_date: string }; Returns: { section_id: string; expected: number; submitted: number; published: number; pending: number; skipped: number }[] };
      diary_class_plan: { Args: { p_section: string; p_date: string }; Returns: { subject_id: string; first_period: number | null; teachers: string | null; skipped: boolean }[] };
      log_message: { Args: { p_kind: string; p_target: string; p_student: string | null; p_section: string | null; p_date: string | null; p_channel: string; p_summary: string }; Returns: string };
      my_diary_reminders: { Args: never; Returns: { id: string; section_id: string; entry_date: string; subject_id: string | null }[] };
      archive_diary: { Args: { p_id: string; p_archive: boolean }; Returns: undefined };
      save_notice: { Args: { p: Json }; Returns: string };
      publish_notice: { Args: { p_id: string }; Returns: string };
      archive_notice: { Args: { p_id: string; p_archive: boolean }; Returns: undefined };
      mark_notice_read: { Args: { p_id: string }; Returns: undefined };
      notice_readers: { Args: { p_notice: string }; Returns: { staff_id: string; full_name: string; designation: string | null; read_at: string | null }[] };
      my_unread_notices: { Args: never; Returns: number };
      add_diary_attachment: { Args: { p_entry: string; p_path: string; p_name: string; p_mime: string; p_size: number }; Returns: string };
      add_notice_attachment: { Args: { p_notice: string; p_path: string; p_name: string; p_mime: string; p_size: number }; Returns: string };
      remove_attachment: { Args: { p_kind: string; p_id: string }; Returns: string };
      session_markers: {
        Args: { p_section: string; p_date: string };
        Returns: { session: string; period_no: number; staff_id: string | null; source: string }[];
      };
      free_teachers: {
        Args: { p_date: string; p_period: number; p_exclude?: string };
        Returns: { id: string; full_name: string; employee_code: string; periods_that_day: number }[];
      };
      mark_attendance: { Args: { p_section: string; p_date: string; p_session: string; p_entries: Json }; Returns: string };
      attendance_roster: { Args: { p_section: string; p_date: string }; Returns: { student_id: string; admission_no: string; full_name: string; roll_no: number | null }[] };
      my_attendance_sessions: {
        Args: { p_date?: string };
        Returns: { section_id: string; section_label: string; session: string; period_no: number; source: string; marked: boolean; marked_kind: string | null }[];
      };
      unmarked_sessions: {
        Args: { p_date?: string };
        Returns: { section_id: string; section_label: string; session: string; period_no: number; staff_id: string | null; staff_name: string | null; source: string }[];
      };
      daily_attendance_summary: {
        Args: { p_date: string };
        Returns: { section_id: string; section_label: string; session: string; marked: boolean; marked_by_name: string | null; kind: string | null; present: number; late: number; absent: number; total: number }[];
      };
      attendance_summary: {
        Args: { p_student: string; p_from: string; p_to: string };
        Returns: { sessions_marked: number; sessions_attended: number; pct: number | null; full_days: number; half_days: number; absent_days: number }[];
      };
      section_attendance: {
        Args: { p_section: string; p_from: string; p_to: string };
        Returns: { student_id: string; admission_no: string; full_name: string; roll_no: number | null; sessions_marked: number; sessions_attended: number; pct: number | null; full_days: number; half_days: number; absent_days: number }[];
      };
      section_day_totals: { Args: { p_section: string; p_from: string; p_to: string }; Returns: { student_id: string; admission_no: string; full_name: string; roll_no: number | null; from_date: string; to_date: string; working_days: number; present_days: number; absent_days: number; marked_sessions: number; unmarked_sessions: number; pct: number | null }[] };
      section_month_day_totals: { Args: { p_section: string; p_month: string }; Returns: { student_id: string; admission_no: string; full_name: string; roll_no: number | null; from_date: string; to_date: string; working_days: number; present_days: number; absent_days: number; marked_sessions: number; unmarked_sessions: number; pct: number | null }[] };
      student_day_totals: {
        Args: { p_student: string; p_from: string; p_to: string };
        Returns: { student_id: string; from_date: string; to_date: string; working_days: number; present_days: number; absent_days: number; marked_sessions: number; unmarked_sessions: number; pct: number | null }[];
      };
      leave_balance: {
        Args: { p_staff: string; p_year: string };
        Returns: { leave_type_id: string; leave_type: string; allowance: number | null; used: number; pending: number; remaining: number | null }[];
      };
      decide_leave: { Args: { p_id: string; p_approve: boolean; p_note?: string }; Returns: undefined };
      cancel_leave: { Args: { p_id: string }; Returns: undefined };
      approved_leave_periods: {
        Args: { p_date: string };
        Returns: { staff_id: string; staff_name: string; leave_type: string; section_id: string; section_label: string; period_no: number; covered: boolean }[];
      };
      staff_attendance_sheet: {
        Args: { p_date: string };
        Returns: { staff_id: string; full_name: string; employee_code: string; designation: string | null; status: string | null; prefilled: boolean; note: string | null }[];
      };
      mark_staff_attendance: { Args: { p_date: string; p_rows: Json }; Returns: number };
      staff_attendance_month: {
        Args: { p_month: string };
        Returns: { staff_id: string; full_name: string; present: number; late: number; absent: number; on_leave: number }[];
      };
      leave_taken: { Args: { p_from: string; p_to: string }; Returns: { staff_id: string; full_name: string; leave_type: string; days: number }[] };
      my_week: { Args: { p_week_start: string }; Returns: MyWeekRow[] };
      export_student_ids: { Args: { p_ids: string[] }; Returns: { student_id: string; field_key: string; value: string }[] };
      staff_directory: {
        Args: never;
        Returns: { id: string; full_name: string; designation: string; department: string; status: string }[];
      };
    };
    Enums: { app_role: AppRole; staff_duty: StaffDuty };
    CompositeTypes: { [_ in never]: never };
  };
};
