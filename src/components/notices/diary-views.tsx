"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, Check, ClipboardCopy, EyeOff, Pencil, Printer, RotateCcw } from "lucide-react";
import { Badge, Card, EmptyState } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/dialog";
import { DataTable, type Column } from "@/components/data-table/data-table";
import { AttachmentsPanel } from "@/components/notices/attachments-panel";
import { archiveDiary, saveDiaryEntry, setDiaryStatus } from "@/features/notices/actions";
import { diaryWhatsApp, fmtLong, fmtShort } from "@/features/notices/shared";
import type { DiaryRow, FileLink } from "@/features/notices/queries";

export type Opt = { id: string; label: string };

function useRun() {
  const router = useRouter();
  return async (p: Promise<{ ok: boolean; message?: string; error?: string }>) => {
    const r = await p;
    if (!r.ok) toast.error(r.error);
    else {
      toast.success(r.message ?? "Done.");
      router.refresh();
    }
    return r.ok;
  };
}

/** Edit one diary entry (editors). */
export function EntryModal({ entry, sections, subjects, files, onClose }: { entry: DiaryRow; sections: Opt[]; subjects: Opt[]; files: FileLink[]; onClose: () => void }) {
  const router = useRouter();
  const [body, setBody] = useState(entry.body);
  const [subjectId, setSubjectId] = useState(entry.subjectId ?? "");
  const [status, setStatus] = useState(entry.status);
  const [secIds, setSecIds] = useState(entry.sectionIds);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={`Diary · ${fmtShort(entry.date)}`}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Close
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              const r = await saveDiaryEntry({ id: entry.id, date: entry.date, sectionIds: secIds, subjectId: subjectId || null, body, status });
              setBusy(false);
              if (!r.ok) return setError(r.error);
              toast.success("Saved.");
              router.refresh();
              onClose();
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-foreground">
        <Field label="Subject (optional)" name="de-subject">
          <Select id="de-subject" value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">— none (class remark) —</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Text" name="de-body">
          <Textarea id="de-body" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
        </Field>
        <fieldset>
          <legend className="mb-1 text-sm font-medium">Sections</legend>
          <div className="flex flex-wrap gap-3">
            {sections.map((s) => (
              <label key={s.id} className="inline-flex items-center gap-1.5 text-sm">
                <input type="checkbox" className="size-4 accent-navy-700" checked={secIds.includes(s.id)} onChange={(e) => setSecIds((x) => (e.target.checked ? [...x, s.id] : x.filter((i) => i !== s.id)))} />
                {s.label}
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Status" name="de-status">
          <Select id="de-status" value={status} onChange={(e) => setStatus(e.target.value as "draft" | "published")}>
            <option value="published">Published (teachers of the sections can see it)</option>
            <option value="draft">Draft (only Admin and editors can see it)</option>
          </Select>
        </Field>
        <AttachmentsPanel kind="diary" parentId={entry.id} files={files} canEdit />
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ day view
export function DayView({
  school,
  sectionLabel,
  date,
  entries,
  files,
  canEdit,
  isAdmin,
  sections,
  subjects,
  printHref,
}: {
  school: string;
  sectionLabel: string;
  date: string;
  entries: DiaryRow[];
  files: Record<string, FileLink[]>;
  canEdit: boolean;
  isAdmin: boolean;
  sections: Opt[];
  subjects: Opt[];
  printHref: string;
}) {
  const run = useRun();
  const [edit, setEdit] = useState<DiaryRow | null>(null);
  const live = entries.filter((e) => !e.archived);
  const published = live.filter((e) => e.status === "published");
  const wa = diaryWhatsApp({ school, classLabel: sectionLabel, date, lines: published.map((e) => ({ subject: e.subject, body: e.body })) });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={printHref} target="_blank" className={buttonClasses("secondary", "sm")}>
          <Printer className="size-4" aria-hidden /> Print daily diary
        </Link>
        <Button
          variant="secondary"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(wa);
              toast.success("Copied. Paste it into the class WhatsApp group.");
            } catch {
              window.prompt("Copy this text:", wa);
            }
          }}
        >
          <ClipboardCopy className="size-4" /> Copy for WhatsApp
        </Button>
        <span className="text-sm text-muted">
          {sectionLabel} · {fmtLong(date)}
        </span>
      </div>
      {live.length === 0 ? (
        <EmptyState title="No diary for this day">{canEdit ? "Use Quick entry to add the day's homework." : "Nothing has been published for this section on this day."}</EmptyState>
      ) : (
        <ul className="grid gap-2">
          {live.map((e) => (
            <li key={e.id}>
              <Card className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-navy-900">
                    {e.subject ?? "Class remark"}
                    {e.status === "draft" && <Badge tone="warning">Draft</Badge>}
                  </p>
                  <p className="mt-0.5 whitespace-pre-wrap text-sm">{e.body}</p>
                  {(files[e.id] ?? []).length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-2 text-xs">
                      {(files[e.id] ?? []).map((f) => (
                        <a key={f.id} href={f.url ?? undefined} target="_blank" rel="noreferrer" className="rounded border border-border px-1.5 py-0.5 text-navy-700 hover:underline">
                          {f.name}
                        </a>
                      ))}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-muted">{e.createdBy && `Added by ${e.createdBy} · `}for {e.sections}</p>
                </div>
                {canEdit && (
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="sm" aria-label="Edit entry" onClick={() => setEdit(e)}>
                      <Pencil className="size-4" /> Edit
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => run(setDiaryStatus(e.id, e.status === "published" ? "draft" : "published"))}>
                      {e.status === "published" ? <><EyeOff className="size-4" /> Unpublish</> : <><Check className="size-4" /> Publish</>}
                    </Button>
                    {isAdmin && (
                      <Button variant="ghost" size="sm" onClick={() => run(archiveDiary(e.id, true))}>
                        <Archive className="size-4" /> Archive
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {edit && <EntryModal entry={edit} sections={sections} subjects={subjects} files={files[edit.id] ?? []} onClose={() => setEdit(null)} />}
    </div>
  );
}

// ------------------------------------------------------------------ table
export function DiaryTable({
  rows,
  files,
  canEdit,
  isAdmin,
  classes,
  sections,
  subjects,
}: {
  rows: DiaryRow[];
  files: Record<string, FileLink[]>;
  canEdit: boolean;
  isAdmin: boolean;
  classes: Opt[];
  sections: (Opt & { classId: string })[];
  subjects: Opt[];
}) {
  const run = useRun();
  const [edit, setEdit] = useState<DiaryRow | null>(null);
  const cols: Column<DiaryRow>[] = [
    { id: "date", header: "Date", hideable: false, pinned: "left", cell: (r) => <span className="whitespace-nowrap font-medium text-navy-900">{fmtShort(r.date)}</span>, sortValue: (r) => r.date, exportValue: (r) => r.date },
    { id: "sections", header: "Class / section", cell: (r) => r.sections, sortValue: (r) => r.sections, exportValue: (r) => r.sections },
    { id: "subject", header: "Subject", cell: (r) => r.subject ?? <span className="text-muted">Class remark</span>, sortValue: (r) => r.subject ?? "", exportValue: (r) => r.subject ?? "" },
    { id: "body", header: "Homework / remark", cell: (r) => <span className="line-clamp-2 max-w-md">{r.body}</span>, exportValue: (r) => r.body },
    { id: "status", header: "Status", cell: (r) => (r.archived ? <Badge>Archived</Badge> : r.status === "draft" ? <Badge tone="warning">Draft</Badge> : <Badge tone="success">Published</Badge>), sortValue: (r) => r.status, exportValue: (r) => (r.archived ? "Archived" : r.status) },
    { id: "by", header: "Added by", cell: (r) => r.createdBy || "—", defaultHidden: true, exportValue: (r) => r.createdBy },
  ];
  return (
    <>
      <DataTable
        id="diary-table"
        rows={rows}
        columns={cols}
        getRowId={(r) => r.id}
        searchText={(r) => `${r.body} ${r.subject ?? ""} ${r.sections}`}
        filters={[
          { id: "class", label: "Class", options: classes.map((c) => ({ value: c.id, label: c.label })), match: (r, v) => r.classIds.includes(v) },
          { id: "section", label: "Section", options: sections.map((s) => ({ value: s.id, label: s.label })), match: (r, v) => r.sectionIds.includes(v) },
          { id: "subject", label: "Subject", options: subjects.map((s) => ({ value: s.id, label: s.label })), match: (r, v) => r.subjectId === v },
          { id: "status", label: "Status", options: [{ value: "published", label: "Published" }, { value: "draft", label: "Draft" }], match: (r, v) => r.status === v && !r.archived },
        ]}
        pageSize={30}
        exportName="diary-entries"
        rowLabel={(r) => `${r.subject ?? "remark"} ${r.date}`}
        rowActions={(r) =>
          canEdit
            ? [
                { id: "edit", kind: "edit", label: "Edit", icon: Pencil, onClick: () => setEdit(r) },
                ...(r.archived
                  ? isAdmin
                    ? [{ id: "restore", kind: "menu" as const, label: "Restore", icon: RotateCcw, onClick: () => void run(archiveDiary(r.id, false)) }]
                    : []
                  : [
                      { id: "pub", kind: "menu" as const, label: r.status === "published" ? "Unpublish (back to draft)" : "Publish", icon: r.status === "published" ? EyeOff : Check, onClick: () => void run(setDiaryStatus(r.id, r.status === "published" ? "draft" : "published")) },
                      ...(isAdmin
                        ? [{ id: "archive", kind: "menu" as const, label: "Archive", icon: Archive, tone: "danger" as const, confirm: { title: "Archive this diary entry?", message: "It disappears for teachers. Admin can restore it.", confirmLabel: "Archive", danger: true }, onClick: () => void run(archiveDiary(r.id, true)) }]
                        : []),
                    ]),
              ]
            : [{ id: "view", kind: "view", label: "View", onClick: () => setEdit(r) }]
        }
        emptyTitle="No diary entries"
        emptyMessage="There are no entries for these dates. Change the date range above or use Quick entry."
      />
      {edit && canEdit && <EntryModal entry={edit} sections={sections} subjects={subjects} files={files[edit.id] ?? []} onClose={() => setEdit(null)} />}
      {edit && !canEdit && (
        <Modal open onClose={() => setEdit(null)} title={`${edit.subject ?? "Class remark"} · ${fmtShort(edit.date)}`} footer={<Button variant="secondary" onClick={() => setEdit(null)}>Close</Button>}>
          <p className="whitespace-pre-wrap text-foreground">{edit.body}</p>
          <p className="mt-2 text-xs">{edit.sections}</p>
        </Modal>
      )}
    </>
  );
}
