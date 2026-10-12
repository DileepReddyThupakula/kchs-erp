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
      staff_directory: {
        Args: never;
        Returns: { id: string; full_name: string; designation: string; department: string; status: string }[];
      };
    };
    Enums: { app_role: AppRole; staff_duty: StaffDuty };
    CompositeTypes: { [_ in never]: never };
  };
};
