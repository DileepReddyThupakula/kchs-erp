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
};
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

export type Database = {
  __InternalSupabase: { PostgrestVersion: "14.18" };
  public: {
    Tables: {
      academic_years: T<AcademicYear, "name" | "start_date" | "end_date">;
      audit_logs: T<AuditLog, "action">;
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
    Views: { [_ in never]: never };
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
