// ID card rules that live in the screens' code: photos never go into an Excel export or the Excel template.
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }), usePathname: () => "/students", useSearchParams: () => new URLSearchParams("") }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), loading: vi.fn(), dismiss: vi.fn() } }));
vi.mock("@/features/audit/actions", () => ({ logExport: vi.fn() }));
vi.mock("@/lib/export", () => ({ exportSheets: vi.fn() }));
vi.mock("@/features/students/actions", () => ({ changeStudentsSection: vi.fn(), studentsForExport: vi.fn(), validateImport: vi.fn(), commitImport: vi.fn() }));
vi.mock("@/app/(app)/students/[id]/client", () => ({ StatusDialog: () => null }));

import { exportFields } from "@/app/(app)/students/students-table";
import { templateColumns } from "@/app/(app)/students/import/wizard";
import type { StudentFieldDefinition } from "@/types/database";

const defs = [{ key: "name_te", label: "Student name in Telugu", field_group: "identity", field_type: "text", options: null, pattern: null, help: null, required_for_gov: false, sensitive: false, reveal_with_duty: false, sort_order: 21, is_active: true }] as unknown as StudentFieldDefinition[];

describe("photos are never exported", () => {
  it("no export field of the student list (Admin's or a teacher's) is a photo", () => {
    for (const manage of [true, false]) expect(exportFields(manage, defs).some((f) => /photo|picture|image/i.test(f.id + f.label))).toBe(false);
  });
  it("the Excel import template has no photo column", () => {
    expect(templateColumns(defs).some((c) => /photo|picture|image/i.test(c.key + c.label))).toBe(false);
  });
  it("the export code never reads the photo field", () => {
    for (const f of ["src/app/(app)/students/students-table.tsx", "src/features/students/fields.ts", "src/app/(app)/students/import/wizard.tsx"]) {
      expect(/photo_path|photoUrl/.test(readFileSync(f, "utf8")), f).toBe(false);
    }
  });
});
