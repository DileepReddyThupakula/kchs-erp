// The three Telugu name fields in the student Excel import template, the import checks and the export. Nothing here talks to a translation service.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => "/students", useSearchParams: () => new URLSearchParams("") }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
vi.mock("@/features/audit/actions", () => ({ logExport: vi.fn() }));
vi.mock("@/lib/export", () => ({ exportSheets: vi.fn() }));
vi.mock("@/features/students/actions", () => ({ changeStudentsSection: vi.fn(), studentsForExport: vi.fn(), validateImport: vi.fn(), commitImport: vi.fn() }));
vi.mock("@/app/(app)/students/[id]/client", () => ({ StatusDialog: () => null }));

import { templateColumns } from "@/app/(app)/students/import/wizard";
import { exportFields } from "@/app/(app)/students/students-table";
import { CORE_COLUMNS, TELUGU_NAME_KEYS, validateImportRow, type ImportContext, type RawRow } from "@/features/students/fields";
import type { StudentFieldDefinition } from "@/types/database";

const def = (o: Partial<StudentFieldDefinition>): StudentFieldDefinition => ({
  key: "x", label: "X", field_group: "identity", field_type: "text", options: null, pattern: null, help: null, required_for_gov: false, sensitive: false, reveal_with_duty: false,
  sort_order: 1, is_active: true, created_at: "", updated_at: "", created_by: null, updated_by: null, ...o,
} as StudentFieldDefinition);
const defs = [
  def({ key: "child_id", label: "AP Child ID", sort_order: 12 }),
  def({ key: "name_te", label: "Student name in Telugu", sort_order: 21 }),
  def({ key: "father_name_te", label: "Father's name in Telugu", sort_order: 22 }),
  def({ key: "mother_name_te", label: "Mother's name in Telugu", sort_order: 23 }),
  def({ key: "caste", label: "Caste", field_group: "social", sort_order: 32 }),
];
const ctx: ImportContext = { yearId: "y1", sections: { "class 6|a": "sec1" }, definitions: defs };
const base: RawRow = { admission_no: "A-1", full_name: "Ravi Kumar", gender: "male", date_of_birth: "2014-01-01", class: "Class 6", section: "A", father_name: "Ramesh Kumar", father_phone: "9000000001" };

describe("Excel import template", () => {
  it("lists the three Telugu name columns right after the normal columns, before the other government fields", () => {
    const cols = templateColumns(defs);
    const keys = cols.map((c) => c.key);
    expect(keys.slice(CORE_COLUMNS.length, CORE_COLUMNS.length + 3)).toEqual(["name_te", "father_name_te", "mother_name_te"]);
    expect(keys.slice(CORE_COLUMNS.length + 3)).toEqual(["child_id", "caste"]);
    const t = cols.find((c) => c.key === "name_te")!;
    expect(t.label).toBe("Student name in Telugu");
    expect(t.required).toBe(false);
    expect(t.allowed).toMatch(/never translates/);
  });
});

describe("import checks keep working and take the Telugu names", () => {
  it("reads the Telugu names exactly as typed (Telugu script, trimmed) into the student's details", () => {
    const v = validateImportRow({ ...base, name_te: "  రవి కుమార్ ", father_name_te: "రమేష్ కుమార్", mother_name_te: "" }, 2, ctx);
    expect(v.errors).toEqual([]);
    expect(v.payload!.details).toMatchObject({ name_te: "రవి కుమార్", father_name_te: "రమేష్ కుమార్" });
    expect("mother_name_te" in (v.payload?.details ?? {})).toBe(false);          // a blank cell stays blank: nothing is guessed
  });
  it("an Excel file without the Telugu columns still imports (they are optional)", () => {
    const v = validateImportRow(base, 2, ctx);
    expect(v.errors).toEqual([]);
    expect(v.payload!.details).toEqual({});
  });
  it("the other checks are unchanged: a missing required column or a bad class is still an error", () => {
    const v = validateImportRow({ ...base, full_name: "", class: "Class 99", name_te: "రవి" }, 2, ctx);
    expect(v.errors.join("|")).toMatch(/Full name is required/);
    expect(v.errors.join("|")).toMatch(/No section "Class 99/);
    expect(v.payload).toBeNull();
  });
});

describe("export", () => {
  it("the Admin's export offers the Telugu names (group 'Telugu names', before other fields); a teacher's list does not", () => {
    const f = exportFields(true, defs);
    const te = f.filter((x) => x.group === "Telugu names");
    expect(te.map((x) => x.id)).toEqual(["def:name_te", "def:father_name_te", "def:mother_name_te"]);
    expect(f.findIndex((x) => x.id === "def:name_te")).toBeLessThan(f.findIndex((x) => x.id === "def:child_id"));
    expect(exportFields(false, defs).some((x) => x.id.startsWith("def:"))).toBe(false);
  });
  it("what is exported can be imported again unchanged (round trip)", () => {
    const row = { details: { name_te: "రవి కుమార్", father_name_te: "రమేష్ కుమార్" } } as never;
    const out: RawRow = { ...base };
    for (const x of exportFields(true, defs).filter((x) => x.group === "Telugu names")) out[x.id.replace("def:", "")] = x.value(row) as string;
    expect(out).toMatchObject({ name_te: "రవి కుమార్", father_name_te: "రమేష్ కుమార్" });
    const v = validateImportRow(out, 2, ctx);
    expect(v.payload!.details).toMatchObject({ name_te: "రవి కుమార్", father_name_te: "రమేష్ కుమార్" });
  });
});

describe("never sent to a translation service", () => {
  it("the import, export and field code do not touch the translation code", () => {
    for (const f of ["src/features/students/fields.ts", "src/app/(app)/students/import/wizard.tsx"]) {
      const src = readFileSync(f, "utf8");
      expect(/from "[^"]*(translate|gemini)[^"]*"/i.test(src)).toBe(false);
    }
    expect(TELUGU_NAME_KEYS).toHaveLength(3);
  });
});
