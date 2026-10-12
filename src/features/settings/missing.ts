import type { SchoolSettings } from "@/types/database";

/** School details the Admin should fill in — shown as a checklist on the dashboard. */
export const REQUIRED_DETAILS: { key: keyof SchoolSettings; label: string }[] = [
  { key: "udise_code", label: "UDISE code" },
  { key: "affiliation_no", label: "Recognition / affiliation number" },
  { key: "phone", label: "Phone number" },
  { key: "email", label: "Email" },
  { key: "website", label: "Website" },
  { key: "logo_path", label: "Logo" },
  { key: "principal_name", label: "Principal name" },
  { key: "pincode", label: "Pincode" },
];

export function detailsChecklist(s: SchoolSettings | null) {
  return REQUIRED_DETAILS.map((d) => ({ label: d.label, done: !!s?.[d.key] }));
}

export function missingDetails(s: SchoolSettings | null) {
  return detailsChecklist(s).filter((d) => !d.done).map((d) => d.label);
}
