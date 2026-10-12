"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Eye, EyeOff, FileText, Loader2, RefreshCcw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { ActionForm, DeleteButton, FormSection } from "@/components/ui/action-form";
import { Field, Input, Select } from "@/components/ui/form";
import { deleteStudentDocument, documentLink, revealStudentIds, setStudentStatus, uploadStudentDocument } from "@/features/students/actions";
import { STATUS_LABEL } from "@/features/students/fields";
import { formatDate } from "@/lib/utils";
import type { StudentDocument } from "@/types/database";

/** Toast after redirecting here from the form. */
export function SavedToast({ saved }: { saved?: string }) {
  const done = useRef(false);
  const router = useRouter();
  useEffect(() => {
    if (!saved || done.current) return;
    done.current = true;
    if (saved === "partial") toast.warning("Student saved, but a photo or document could not be uploaded. Try again from the Documents tab.");
    else toast.success("Student saved.");
    router.replace(window.location.pathname + window.location.search.replace(/[?&]saved=[^&]*/, "").replace(/^&/, "?"), { scroll: false });
  }, [saved, router]);
  return null;
}

/** Full ID numbers: Admin / government_ids_view only; logged; hidden again after 60 s. */
export function RevealIdsButton({ studentId }: { studentId: string }) {
  const [values, setValues] = useState<{ label: string; value: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!values) return;
    const t = setTimeout(() => setValues(null), 60_000);
    return () => clearTimeout(t);
  }, [values]);
  return (
    <>
      <Button
        variant="secondary"
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          const res = await revealStudentIds(studentId);
          setBusy(false);
          if (res.error) toast.error(res.error);
          else setValues(res.values ?? []);
        }}
      >
        {!busy && <Eye className="size-4" />} Reveal full numbers
      </Button>
      <Modal
        open={!!values}
        onClose={() => setValues(null)}
        title="Full ID numbers"
        footer={
          <Button onClick={() => setValues(null)}>
            <EyeOff className="size-4" /> Hide
          </Button>
        }
      >
        <p className="mb-3">This view was recorded in the audit log. It closes by itself after one minute.</p>
        <dl className="space-y-2">
          {values?.map((v) => (
            <div key={v.label} className="flex items-center justify-between gap-3 rounded-lg bg-cream-100 px-3 py-2">
              <dt className="text-sm text-muted">{v.label}</dt>
              <dd className="font-mono text-base font-semibold tracking-wider text-navy-900">{v.value}</dd>
            </div>
          ))}
        </dl>
      </Modal>
    </>
  );
}

/** Admin only: change status (active / left / TC issued / passed out). */
export function StatusDialog({ id, status, name, open, onClose }: { id: string; status: string; name?: string; open: boolean; onClose: () => void }) {
  const router = useRouter();
  return (
    <Modal open={open} onClose={onClose} title={name ? `Change status: ${name}` : "Change student status"}>
      <ActionForm
        key={`${id}-${open}`}
        action={setStudentStatus}
        submitLabel="Update status"
        onSuccess={() => {
          onClose();
          router.refresh();
        }}
        className="space-y-3"
      >
        {(fe) => (
          <>
            <input type="hidden" name="id" value={id} />
            <Field label="Status" name="status" errors={fe.status}>
              <Select id="status" name="status" defaultValue={status}>
                {Object.entries(STATUS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Date" name="status_date" errors={fe.status_date} hint="Blank = today (ignored for Active)">
              <Input id="status_date" name="status_date" type="date" />
            </Field>
            <Field label="Reason" name="status_reason" errors={fe.status_reason}>
              <Input id="status_reason" name="status_reason" placeholder="e.g. Family moved to Kadapa" />
            </Field>
            <p className="text-xs text-muted">Students are never deleted; their record and history stay.</p>
          </>
        )}
      </ActionForm>
    </Modal>
  );
}

export function StatusButton({ id, status }: { id: string; status: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        <RefreshCcw className="size-4" /> Change status
      </Button>
      <StatusDialog id={id} status={status} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function DocumentsPanel({
  studentId,
  documents,
  docTypes,
  canDelete,
}: {
  studentId: string;
  documents: StudentDocument[];
  docTypes: { code: string; label: string; required: boolean }[];
  canDelete: boolean;
}) {
  const [opening, setOpening] = useState<string | null>(null);
  const router = useRouter();
  const label = (code: string) => docTypes.find((d) => d.code === code)?.label ?? code;
  const missing = docTypes.filter((d) => d.required && !documents.some((x) => x.doc_type === d.code));
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-navy-900">Documents</h2>
          {missing.length > 0 && <Badge tone="warning">Missing: {missing.map((m) => m.label).join(", ")}</Badge>}
        </div>
        {documents.length === 0 ? (
          <EmptyState>No documents uploaded yet.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                <FileText className="size-4 text-navy-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-navy-900">{label(d.doc_type)}</p>
                  <p className="truncate text-xs text-muted">
                    {d.file_name} · {Math.max(1, Math.round(d.size_bytes / 1024))} KB · {formatDate(d.created_at.slice(0, 10))}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={opening === d.id}
                  onClick={async () => {
                    setOpening(d.id);
                    const res = await documentLink(d.id);
                    setOpening(null);
                    if (res.url) window.open(res.url, "_blank", "noopener");
                    else toast.error(res.error ?? "Could not open.");
                  }}
                >
                  {opening === d.id ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />} Open
                </Button>
                {canDelete && <DeleteButton action={deleteStudentDocument} id={d.id} iconOnly label="Delete document" title="Delete this document?" confirmText="The file is removed permanently." />}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">Files are private. “Open” creates a link that works for one minute; each opening is recorded.</p>
      </Card>
      <Card>
        <h2 className="mb-3 flex items-center gap-2 font-semibold text-navy-900">
          <Upload className="size-4 text-navy-500" /> Upload a document
        </h2>
        <ActionForm action={uploadStudentDocument} submitLabel="Upload" resetOnSuccess onSuccess={() => router.refresh()} className="space-y-3">
          {(fe) => (
            <FormSection title="" columns={1}>
              <input type="hidden" name="student_id" value={studentId} />
              <Field label="Type" name="doc_type" errors={fe.doc_type}>
                <Select id="doc_type" name="doc_type" defaultValue={missing[0]?.code ?? ""} required>
                  <option value="" disabled>
                    Pick a type
                  </option>
                  {docTypes.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="File" name="file" errors={fe.file} hint="PDF or image, under 5 MB">
                <input id="file" name="file" type="file" accept="application/pdf,image/jpeg,image/png,image/webp" required className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-navy-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-navy-800" />
              </Field>
            </FormSection>
          )}
        </ActionForm>
      </Card>
    </div>
  );
}
