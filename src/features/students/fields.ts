/**
 * Student field knowledge shared by the form, the Excel import and exports.
 * Pure functions only (runs in the browser and on the server). The database
 * re-checks everything (triggers + RLS), so this is for friendly messages.
 */
import type { StudentFieldDefinition } from "@/types/database";

export const GENDERS = ["male", "female", "other"] as const;
export const RELATIONS = ["father", "mother", "guardian", "grandparent", "sibling", "other"] as const;
export const STATUS_LABEL: Record<string, string> = { active: "Active", left: "Left", tc_issued: "TC issued", passed_out: "Passed out" };
export const GROUP_LABEL: Record<StudentFieldDefinition["field_group"], string> = {
  identity: "Identity",
  social: "Social profile",
  disability: "Disability (CWSN)",
  enrolment: "Enrolment",
  previous_school: "Previous school",
  facilities: "Facilities",
  other: "Other",
};

export const PHONE_RE = /^[6-9][0-9]{9}$/;
export const PIN_RE = /^[1-9][0-9]{5}$/;

export function maskId(last4: string | null | undefined) {
  return last4 ? `XXXX XXXX ${last4}` : "";
}

/** Fixed (non-definition) import columns, in template order. */
export const CORE_COLUMNS = [
  { key: "admission_no", label: "Admission no", required: true, help: "Unique. Rows whose admission no already exists are skipped (safe to re-import)." },
  { key: "full_name", label: "Full name", required: true, help: "Telugu script is fine" },
  { key: "gender", label: "Gender", required: true, help: "male / female / other" },
  { key: "date_of_birth", label: "Date of birth", required: true, help: "Excel date or YYYY-MM-DD" },
  { key: "admission_date", label: "Admission date", required: false, help: "Excel date or YYYY-MM-DD (blank = today)" },
  { key: "class", label: "Class", required: true, help: "Exactly as in Classes & sections" },
  { key: "section", label: "Section", required: true, help: "e.g. A" },
  { key: "roll_no", label: "Roll no", required: false, help: "Whole number, unique in the section" },
  { key: "address", label: "Address", required: false, help: "" },
  { key: "village_town", label: "Village / town", required: false, help: "" },
  { key: "district", label: "District", required: false, help: "" },
  { key: "pincode", label: "Pincode", required: false, help: "6 digits" },
  { key: "father_name", label: "Father name", required: false, help: "" },
  { key: "father_phone", label: "Father mobile", required: false, help: "10 digits" },
  { key: "father_occupation", label: "Father occupation", required: false, help: "" },
  { key: "father_education", label: "Father education", required: false, help: "" },
  { key: "mother_name", label: "Mother name", required: false, help: "" },
  { key: "mother_phone", label: "Mother mobile", required: false, help: "10 digits" },
  { key: "mother_occupation", label: "Mother occupation", required: false, help: "" },
  { key: "mother_education", label: "Mother education", required: false, help: "" },
  { key: "guardian_name", label: "Guardian name", required: false, help: "Only if not father/mother" },
  { key: "guardian_relation", label: "Guardian relation", required: false, help: RELATIONS.join(" / ") },
  { key: "guardian_phone", label: "Guardian mobile", required: false, help: "10 digits" },
  { key: "primary_contact", label: "Primary contact", required: false, help: "father / mother / guardian (blank = father)" },
  { key: "sibling_admission_no", label: "Sibling admission no", required: false, help: "Shares that student's parents instead of the parent columns" },
] as const;

export type ImportContext = {
  yearId: string;
  /** "<class name>|<section name>" (lower case) -> section id */
  sections: Record<string, string>;
  definitions: StudentFieldDefinition[];
};

export type RawRow = Record<string, string | number | boolean | null | undefined>;

export type ValidatedRow = {
  rowNo: number;
  admissionNo: string;
  name: string;
  errors: string[];
  payload: StudentPayload | null;
};

export type StudentPayload = {
  id?: string;
  student: Record<string, string | null>;
  enrollment?: { academic_year_id: string; section_id: string; roll_no: string | null };
  guardians?: Record<string, string | boolean | null>[];
  sibling_admission_no?: string;
  details?: Record<string, unknown>;
  secure?: Record<string, string>;
};

const str = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/** Excel cell -> YYYY-MM-DD (accepts Date, ISO text, or DD/MM/YYYY). */
export function toIsoDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  const s = str(v);
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return "invalid";
}

export function toBool(v: unknown): boolean | null | "invalid" {
  if (typeof v === "boolean") return v;
  const s = str(v).toLowerCase();
  if (!s) return null;
  if (["yes", "y", "true", "1"].includes(s)) return true;
  if (["no", "n", "false", "0"].includes(s)) return false;
  return "invalid";
}

/** Convert one definition value from text/cell input; returns [value, error]. */
export function parseDefinitionValue(def: StudentFieldDefinition, v: unknown): [unknown, string | null] {
  const s = str(v);
  if (def.field_type === "multiselect") {
    const parts = (Array.isArray(v) ? (v as unknown[]).map(str) : s.split(/[;,]/).map((x) => x.trim())).filter(Boolean);
    if (!parts.length) return [undefined, null];
    const bad = parts.filter((p) => !def.options?.includes(p));
    return bad.length ? [undefined, `${def.label}: not allowed: ${bad.join(", ")}`] : [parts, null];
  }
  if (!s && typeof v !== "boolean") return [undefined, null];
  switch (def.field_type) {
    case "number": {
      const n = Number(s);
      return isNaN(n) ? [undefined, `${def.label}: must be a number`] : [n, null];
    }
    case "boolean": {
      const b = toBool(v);
      return b === "invalid" ? [undefined, `${def.label}: use yes or no`] : [b ?? undefined, null];
    }
    case "date": {
      const d = toIsoDate(v);
      return d === "invalid" ? [undefined, `${def.label}: use a date (YYYY-MM-DD)`] : [d ?? undefined, null];
    }
    case "select": {
      const match = def.options?.find((o) => o.toLowerCase() === s.toLowerCase());
      return match ? [match, null] : [undefined, `${def.label}: must be one of ${def.options?.join(", ")}`];
    }
    default: {
      if (def.pattern && !new RegExp(def.pattern).test(def.sensitive ? s.replace(/\s/g, "") : s)) return [undefined, `${def.label}: not in the expected format${def.help ? ` (${def.help})` : ""}`];
      return [s, null];
    }
  }
}

/** Validate + convert one import row into a save_student payload. */
export function validateImportRow(raw: RawRow, rowNo: number, ctx: ImportContext): ValidatedRow {
  const errors: string[] = [];
  const get = (k: string) => str(raw[k]);
  const admissionNo = get("admission_no").toUpperCase();
  const name = get("full_name");

  for (const c of CORE_COLUMNS) if (c.required && !get(c.key)) errors.push(`${c.label} is required`);
  const gender = get("gender").toLowerCase();
  if (gender && !(GENDERS as readonly string[]).includes(gender)) errors.push("Gender must be male, female or other");
  const dob = toIsoDate(raw.date_of_birth);
  if (dob === "invalid") errors.push("Date of birth is not a valid date");
  const adm = toIsoDate(raw.admission_date);
  if (adm === "invalid") errors.push("Admission date is not a valid date");
  const sectionId = ctx.sections[`${get("class").toLowerCase()}|${get("section").toLowerCase()}`];
  if (get("class") && get("section") && !sectionId) errors.push(`No section "${get("class")} – ${get("section")}" in this academic year`);
  const roll = get("roll_no");
  if (roll && !/^[1-9][0-9]*$/.test(roll)) errors.push("Roll no must be a whole number");
  if (get("pincode") && !PIN_RE.test(get("pincode"))) errors.push("Pincode must be 6 digits");
  for (const k of ["father_phone", "mother_phone", "guardian_phone"]) {
    if (get(k) && !PHONE_RE.test(get(k))) errors.push(`${k.replace("_", " ")} must be a 10-digit mobile number`);
  }
  const rel = get("guardian_relation").toLowerCase();
  if (get("guardian_name") && rel && !(RELATIONS as readonly string[]).includes(rel)) errors.push("Guardian relation is not allowed");
  const primary = get("primary_contact").toLowerCase() || "father";
  if (!["father", "mother", "guardian"].includes(primary)) errors.push("Primary contact must be father, mother or guardian");

  const details: Record<string, unknown> = {};
  const secure: Record<string, string> = {};
  for (const def of ctx.definitions) {
    if (!def.is_active || !(def.key in raw)) continue;
    const [value, err] = parseDefinitionValue(def, raw[def.key]);
    if (err) errors.push(err);
    else if (value !== undefined) {
      if (def.sensitive) secure[def.key] = String(value).replace(/\s/g, "");
      else details[def.key] = value;
    }
  }

  const guardians: Record<string, string | boolean | null>[] = [];
  if (!get("sibling_admission_no")) {
    if (get("father_name")) guardians.push({ relation: "father", full_name: get("father_name"), phone: get("father_phone") || null, occupation: get("father_occupation") || null, education: get("father_education") || null, is_primary: primary === "father" });
    if (get("mother_name")) guardians.push({ relation: "mother", full_name: get("mother_name"), phone: get("mother_phone") || null, occupation: get("mother_occupation") || null, education: get("mother_education") || null, is_primary: primary === "mother" });
    if (get("guardian_name")) guardians.push({ relation: rel || "guardian", full_name: get("guardian_name"), phone: get("guardian_phone") || null, is_primary: primary === "guardian" });
    if (!guardians.length) errors.push("Give at least one parent/guardian, or a sibling admission no");
  }

  return {
    rowNo,
    admissionNo,
    name,
    errors,
    payload: errors.length
      ? null
      : {
          student: {
            admission_no: admissionNo,
            full_name: name,
            gender,
            date_of_birth: dob as string,
            admission_date: adm && adm !== "invalid" ? adm : null,
            address: get("address") || null,
            village_town: get("village_town") || null,
            district: get("district") || null,
            pincode: get("pincode") || null,
          },
          enrollment: sectionId ? { academic_year_id: ctx.yearId, section_id: sectionId, roll_no: roll || null } : undefined,
          guardians,
          sibling_admission_no: get("sibling_admission_no") || undefined,
          details,
          secure,
        },
  };
}

/** Which required-for-government fields are missing for a student. */
export function missingGovFields(defs: StudentFieldDefinition[], details: Record<string, unknown>, secureKeys: Set<string>) {
  return defs
    .filter((d) => d.is_active && d.required_for_gov)
    .filter((d) => (d.sensitive ? !secureKeys.has(d.key) : details[d.key] === undefined || details[d.key] === null || details[d.key] === ""))
    .map((d) => d.label);
}
