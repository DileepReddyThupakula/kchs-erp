"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, BellRing, Check, FastForward, ImageIcon, Languages, Pencil, Plus, RefreshCw, Send, Undo2 } from "lucide-react";
import { Badge, Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Field, Select, Textarea } from "@/components/ui/form";
import { Modal } from "@/components/ui/dialog";
import { AttachmentsPanel } from "@/components/notices/attachments-panel";
import { DiarySharePanel, type ShareClass } from "@/components/notices/share-panel";
import type { CardSchool } from "@/components/notices/diary-card";
import { adminSaveDiaryLine, publishClassDiary, remindDiary, retryTranslation, skipDiarySubject, unpublishClassDiary } from "@/features/notices/actions";
import { combinedDiaryText, fmtLong, STATUS_TEXT, type CombinedLine } from "@/features/notices/shared";
import { hasTelugu } from "@/lib/translate/telugu";
import type { ClassLine, TeStatus } from "@/features/notices/diary-workflow";

type Opt = { id: string; label: string };
const TONE = { missing: "danger", skipped: "neutral", draft: "warning", submitted: "info", published: "success" } as const;
const lineStatus = (l: ClassLine) => (l.entry ? l.entry.status : l.skipped ? "skipped" : "missing");

function EditLine({ line, sectionId, date, onClose }: { line: { subjectId: string | null; subject: string | null; entry: ClassLine["entry"] }; sectionId: string; date: string; onClose: () => void }) {
  const router = useRouter();
  const [body, setBody] = useState(line.entry?.body ?? "");
  const [te, setTe] = useState(line.entry?.bodyTe ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={`${line.subject ?? "Class remark"} · ${fmtLong(date)}`}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button
            loading={busy}
            disabled={body.trim().length < 2}
            onClick={async () => {
              setBusy(true);
              const r = await adminSaveDiaryLine({ sectionId, date, subjectId: line.subjectId, body, bodyTe: te });
              setBusy(false);
              if (!r.ok) return setError(r.error);
              toast.success("Line saved.");
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
        {line.entry?.status === "published" && <p className="rounded-lg bg-amber-50 p-2 text-sm text-amber-900">This line is already published. Your change is visible to teachers straight away; send the updated image again if it was already shared.</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="English" name="el-body">
            <Textarea id="el-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <Field label="Telugu (తెలుగు)" name="el-te" hint="Filled in automatically. Change it here and it becomes “Reviewed” (never overwritten). Type or paste Telugu text.">
            <Textarea id="el-te" rows={5} lang="te" value={te} onChange={(e) => setTe(e.target.value)} />
          </Field>
        </div>
        {line.entry && <AttachmentsPanel kind="diary" parentId={line.entry.id} files={line.entry.files} canEdit />}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      </div>
    </Modal>
  );
}

function TeBadge({ status, hasTe, englishHasTelugu }: { status: TeStatus; hasTe: boolean; englishHasTelugu: boolean }) {
  if (englishHasTelugu) return null;
  if (status === "reviewed") return <Badge tone="success">Reviewed</Badge>;
  if (status === "auto" && hasTe) return <Badge tone="info">Auto-translated</Badge>;
  if (status === "pending") return <Badge tone="warning">Translation pending</Badge>;
  return null;
}

export function ClassDay({
  sectionId,
  classLabel,
  date,
  lines,
  school,
  subjects,
  autoSend,
}: {
  sectionId: string;
  classLabel: string;
  date: string;
  lines: ClassLine[];
  school: CardSchool;
  subjects: Opt[];
  autoSend: boolean;
}) {
  const router = useRouter();
  const [edit, setEdit] = useState<{ subjectId: string | null; subject: string | null; entry: ClassLine["entry"] } | null>(null);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState("");
  const [share, setShare] = useState(autoSend);
  const [busy, setBusy] = useState(false);

  const present = lines.filter((l) => l.entry);
  const pending = present.filter((l) => l.entry!.status === "submitted").length;
  const published = present.filter((l) => l.entry!.status === "published").length;
  const drafts = present.filter((l) => l.entry!.status === "draft").length;
  const expectedLines = lines.filter((l) => l.expected);
  const inCount = expectedLines.filter((l) => l.entry && l.entry.status !== "draft").length;

  const toCombined = (l: ClassLine): CombinedLine => ({ subject: l.subject, subjectTe: l.subjectTe, body: l.entry!.body, bodyTe: l.entry!.bodyTe || null });
  const pubLines = useMemo(() => lines.filter((l) => l.entry?.status === "published").map(toCombined), [lines]);
  const previewLines = useMemo(() => lines.filter((l) => l.entry && l.entry.status !== "draft").map(toCombined), [lines]);
  const sharing = pending > 0 || !published ? previewLines : pubLines;
  const shareClasses: ShareClass[] = useMemo(() => [{ sectionId, label: classLabel, lines: sharing }], [sectionId, classLabel, sharing]);
  const text = combinedDiaryText({ school: school.name, classLabel, date, lines: sharing });
  const blocked = !published ? "Nothing is published yet. This is a preview of what the parents' image will look like. Publish the class to enable sending." : pending > 0 ? "Some lines are not published yet. This preview includes them; publish the class to enable sending." : undefined;

  async function run(p: Promise<{ ok: boolean; message?: string; error?: string }>) {
    setBusy(true);
    const r = await p;
    setBusy(false);
    if (!r.ok) toast.error(r.error);
    else {
      toast.success(r.message ?? "Done.");
      router.refresh();
    }
  }
  const usedSubjects = new Set(lines.map((l) => l.subjectId).filter(Boolean));
  const addable = subjects.filter((s) => !usedSubjects.has(s.id) || lines.find((l) => l.subjectId === s.id && !l.entry));
  const hasRemark = !!lines.find((l) => l.kind === "remark")?.entry;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={`/diary/class?date=${date}`} className={buttonClasses("ghost", "sm")}>
          <ArrowLeft className="size-4" aria-hidden /> All classes
        </Link>
        <span className="text-sm text-muted">
          {fmtLong(date)} · {inCount} of {expectedLines.length} subjects in · {published} published{pending ? ` · ${pending} waiting to publish` : ""}
          {drafts ? ` · ${drafts} teacher draft(s) not submitted` : ""}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {pending > 0 && (
          <Button disabled={busy} onClick={() => run(publishClassDiary(sectionId, date))}>
            <Check className="size-4" /> Publish class
          </Button>
        )}
        {published > 0 && (
          <Button variant="secondary" disabled={busy} onClick={() => run(unpublishClassDiary(sectionId, date))}>
            <Undo2 className="size-4" /> Unpublish
          </Button>
        )}
        <Button variant={published > 0 && pending === 0 ? "accent" : "secondary"} onClick={() => setShare(true)} disabled={previewLines.length === 0}>
          {published > 0 && pending === 0 ? <Send className="size-4" /> : <ImageIcon className="size-4" />} {published > 0 && pending === 0 ? "Send on WhatsApp" : "Preview image"}
        </Button>
        {present.some((l) => l.entry!.teStatus === "pending" && !hasTelugu(l.entry!.body)) && (
          <Button variant="secondary" disabled={busy} onClick={() => run(retryTranslation({ sectionId, date }))}>
            <Languages className="size-4" /> Translate pending lines
          </Button>
        )}
        <Button variant="secondary" onClick={() => setAdding(true)}>
          <Plus className="size-4" /> Add entry
        </Button>
      </div>

      <ul className="grid gap-2">
        {lines.map((l) => {
          const st = lineStatus(l);
          if (l.kind === "remark" && !l.entry) return null;
          return (
            <li key={l.key}>
              <Card className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-navy-900">{l.subject ?? "Class remark"}</h3>
                  {l.period != null && <span className="text-xs text-muted">period {l.period}</span>}
                  <Badge tone={TONE[st]}>{STATUS_TEXT[st]}</Badge>
                  {!l.expected && l.entry && l.kind === "subject" && <span className="text-xs text-muted">not in the timetable today</span>}
                  <span className="flex-1" />
                  {l.entry ? (
                    <Button variant="ghost" size="sm" onClick={() => setEdit({ subjectId: l.subjectId, subject: l.subject, entry: l.entry })}>
                      <Pencil className="size-4" /> Edit
                    </Button>
                  ) : l.skipped ? (
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(skipDiarySubject(sectionId, date, l.subjectId!, false))}>
                      <Undo2 className="size-4" /> Expect again
                    </Button>
                  ) : (
                    <>
                      <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(remindDiary(sectionId, date, l.subjectId))}>
                        <BellRing className="size-4" /> Remind
                      </Button>
                      <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(skipDiarySubject(sectionId, date, l.subjectId!, true))}>
                        <FastForward className="size-4" /> Skip this subject
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setEdit({ subjectId: l.subjectId, subject: l.subject, entry: null })}>
                        <Pencil className="size-4" /> Write it
                      </Button>
                    </>
                  )}
                </div>
                {l.entry ? (
                  <div className="space-y-1">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <p className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-muted">English</p>
                        <p className="whitespace-pre-wrap text-sm">{l.entry.body}</p>
                      </div>
                      <div>
                        <p className="mb-0.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted">
                          తెలుగు
                          <TeBadge status={l.entry.teStatus} hasTe={!!l.entry.bodyTe} englishHasTelugu={hasTelugu(l.entry.body)} />
                          {l.entry.teStatus === "pending" && !hasTelugu(l.entry.body) && (
                            <Button variant="ghost" size="sm" disabled={busy} onClick={() => run(retryTranslation({ entryId: l.entry!.id }))}>
                              <RefreshCw className="size-3.5" /> Retry
                            </Button>
                          )}
                        </p>
                        {l.entry.bodyTe ? <p className="whitespace-pre-wrap text-sm">{l.entry.bodyTe}</p> : <p className="text-sm text-muted">{l.entry.teStatus === "pending" ? "Translation pending. Retry, or click Edit and type the Telugu." : "No Telugu."}</p>}
                      </div>
                    </div>
                    {l.entry.files.length > 0 && (
                      <p className="flex flex-wrap gap-2 text-xs">
                        {l.entry.files.map((f) => (
                          <a key={f.id} href={f.url ?? undefined} target="_blank" rel="noreferrer" className="rounded border border-border px-1.5 py-0.5 text-navy-700 hover:underline">
                            {f.name}
                          </a>
                        ))}
                      </p>
                    )}
                    {l.entry.authorName && <p className="text-xs text-muted">By {l.entry.authorName}</p>}
                  </div>
                ) : l.skipped ? (
                  <p className="text-sm text-muted">Skipped: not expected today.</p>
                ) : (
                  <p className="text-sm text-red-700">Not submitted{l.teachers ? ` by ${l.teachers}` : ""}.</p>
                )}
              </Card>
            </li>
          );
        })}
      </ul>
      {lines.every((l) => !l.entry && l.kind === "remark") && lines.length === 1 && <p className="text-sm text-muted">The timetable has no subjects for this class on this day.</p>}

      {edit && <EditLine line={edit} sectionId={sectionId} date={date} onClose={() => setEdit(null)} />}
      {adding && (
        <Modal
          open
          onClose={() => setAdding(false)}
          title="Add entry"
          footer={
            <>
              <Button variant="secondary" onClick={() => setAdding(false)}>
                Cancel
              </Button>
              <Button
                disabled={!pick}
                onClick={() => {
                  const s = pick === "remark" ? null : subjects.find((x) => x.id === pick)!;
                  setAdding(false);
                  setEdit({ subjectId: s ? s.id : null, subject: s ? s.label : null, entry: lines.find((l) => l.subjectId === (s?.id ?? "x"))?.entry ?? null });
                  setPick("");
                }}
              >
                Continue
              </Button>
            </>
          }
        >
          <Field label="Subject" name="add-subj">
            <Select id="add-subj" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose…</option>
              {!hasRemark && <option value="remark">Class remark</option>}
              {addable.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </Select>
          </Field>
        </Modal>
      )}
      <DiarySharePanel open={share} onClose={() => setShare(false)} school={school} date={date} classes={shareClasses} text={text} title={`Diary · ${classLabel}`} printHref={`/print/diary?section=${sectionId}&date=${date}`} blockedReason={blocked} />
    </div>
  );
}
