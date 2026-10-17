"use client";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { FileSpreadsheet, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Field, Select } from "@/components/ui/form";
import { exportSheets } from "@/lib/export";
import { governmentExportRows } from "@/features/students/actions";
import type { SectionOption } from "@/features/students/queries";

type Lite = { id: string; sectionId: string | null; classId: string | null; status: string; missingGov: number };

export function GovernmentExport({ yearName, sections, students }: { yearName: string; sections: SectionOption[]; students: Lite[] }) {
  const classes = useMemo(() => [...new Map(sections.map((s) => [s.classId, s.className])).entries()], [sections]);
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [status, setStatus] = useState("active");
  const [fullIds, setFullIds] = useState(false);
  const [busy, setBusy] = useState(false);

  const chosen = students.filter((s) => (!classId || s.classId === classId) && (!sectionId || s.sectionId === sectionId) && (!status || s.status === status) && s.sectionId);
  const incomplete = chosen.filter((s) => s.missingGov > 0).length;

  async function run() {
    setBusy(true);
    const res = await governmentExportRows({
      studentIds: chosen.map((s) => s.id),
      includeFullIds: fullIds,
      filters: { class: classes.find(([id]) => id === classId)?.[1] ?? "All classes", section: sections.find((s) => s.id === sectionId)?.label ?? "All sections", status: status || "All" },
    });
    setBusy(false);
    if (res.error || !res.headers) return toast.error(res.error ?? "Export failed.");
    await exportSheets(`government-export-${yearName}${fullIds ? "-FULL-IDS" : ""}`, "xlsx", [{ name: "Students", headers: res.headers, rows: res.rows ?? [] }]);
    toast.success(`Exported ${res.rows?.length ?? 0} students${fullIds ? " with FULL ID numbers" : ""}. Logged in the audit log.`);
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <Card>
        <h2 className="mb-3 font-semibold text-navy-900">Which students</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Class" name="g-class">
            <Select id="g-class" value={classId} onChange={(e) => { setClassId(e.target.value); setSectionId(""); }}>
              <option value="">All classes</option>
              {classes.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Section" name="g-section">
            <Select id="g-section" value={sectionId} onChange={(e) => setSectionId(e.target.value)}>
              <option value="">All sections</option>
              {sections.filter((s) => !classId || s.classId === classId).map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </Select>
          </Field>
          <Field label="Status" name="g-status">
            <Select id="g-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="active">Active</option>
              <option value="">All</option>
            </Select>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="info">{chosen.length} students enrolled in {yearName}</Badge>
          {incomplete > 0 && <Badge tone="warning">{incomplete} missing required government fields</Badge>}
        </div>
      </Card>
      <Card>
        <h2 className="mb-2 font-semibold text-navy-900">ID numbers</h2>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={fullIds} onChange={(e) => setFullIds(e.target.checked)} className="mt-1 accent-navy-700" />
          <span>
            Include <strong>full</strong> Aadhaar / ration card / UDID numbers
            <span className="block text-xs text-muted">Off = masked (XXXX XXXX 1234). Turn on only for the official upload, and delete the file afterwards.</span>
          </span>
        </label>
        <div className="mt-4">
          {fullIds ? (
            <ConfirmDialog
              title="Export with full ID numbers?"
              message={<span className="flex gap-2"><ShieldAlert className="size-5 shrink-0 text-red-700" /> The file will contain full Aadhaar numbers for {chosen.length} students. This export is recorded in the audit log under your name. Keep the file safe and delete it after uploading.</span>}
              confirmLabel="Export with full IDs"
              onConfirm={run}
              trigger={(open) => (
                <Button variant="danger" className="w-full" disabled={!chosen.length || busy} loading={busy} onClick={open}>
                  {!busy && <FileSpreadsheet className="size-4" />} Export with full IDs
                </Button>
              )}
            />
          ) : (
            <Button className="w-full" disabled={!chosen.length || busy} loading={busy} onClick={run}>
              {!busy && <FileSpreadsheet className="size-4" />} Export (IDs masked)
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}
