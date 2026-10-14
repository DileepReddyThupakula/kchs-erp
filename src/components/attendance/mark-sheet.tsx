"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Check, Lock, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buttonClasses } from "@/components/ui/button-classes";
import { Badge, Card } from "@/components/ui/card";
import { cn, formatDate } from "@/lib/utils";
import { saveAttendance } from "@/features/attendance/actions";
import { KIND_LABEL, SESSION_LABEL, STATUS_LABEL, type SessionName, type Status } from "@/features/attendance/shared";

export type SheetStudent = { studentId: string; admissionNo: string; name: string; roll: number | null };

const STATUS_STYLE: Record<Status, string> = {
  present: "data-[on=true]:border-peacock-600 data-[on=true]:bg-peacock-600 data-[on=true]:text-white",
  absent: "data-[on=true]:border-red-700 data-[on=true]:bg-red-700 data-[on=true]:text-white",
  late: "data-[on=true]:border-amber-600 data-[on=true]:bg-amber-500 data-[on=true]:text-navy-950",
  leave: "data-[on=true]:border-navy-700 data-[on=true]:bg-navy-700 data-[on=true]:text-white",
};
const ORDER: Status[] = ["present", "absent", "late", "leave"];

/**
 * Mark one session. Mobile first: big tap targets, the summary and Save stay
 * at the bottom. Locked / not-yours sessions open read-only with the reason.
 */
export function MarkSheet({
  sectionId,
  sectionLabel,
  date,
  session,
  students,
  saved,
  editable,
  lockNote,
  backHref,
}: {
  sectionId: string;
  sectionLabel: string;
  date: string;
  session: SessionName;
  students: SheetStudent[];
  saved: { markedByName: string | null; markedAt: string; kind: string; rows: Record<string, { status: string; note: string | null }> } | null;
  editable: boolean;
  lockNote: string | null;
  backHref: string;
}) {
  const router = useRouter();
  const [marks, setMarks] = useState<Record<string, Status | undefined>>(() =>
    Object.fromEntries(students.map((s) => [s.studentId, (saved?.rows[s.studentId]?.status as Status | undefined) ?? undefined])),
  );
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ present: number; absent: number; late: number; leave: number; at: string } | null>(null);
  const [error, setError] = useState("");

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, leave: 0, unmarked: 0 };
    for (const s of students) {
      const m = marks[s.studentId];
      if (m) c[m]++;
      else c.unmarked++;
    }
    return c;
  }, [marks, students]);
  const changed = students.some((s) => marks[s.studentId] !== (saved?.rows[s.studentId]?.status as Status | undefined));

  async function save() {
    setError("");
    setBusy(true);
    const entries = students.filter((s) => marks[s.studentId]).map((s) => ({ studentId: s.studentId, status: marks[s.studentId]! }));
    const res = await saveAttendance({ sectionId, date, session, entries });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      toast.error(res.error);
      return;
    }
    toast.success("Attendance saved");
    setDone({ ...res.counts!, at: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" }) });
    router.refresh();
  }

  if (done) {
    return (
      <Card className="mx-auto max-w-xl text-center" role="status">
        <CheckCircle2 className="mx-auto size-12 text-peacock-600" aria-hidden />
        <h2 className="mt-2 text-xl font-semibold text-navy-900">Attendance saved</h2>
        <p className="text-sm text-muted">
          {sectionLabel} · {SESSION_LABEL[session]} · {formatDate(date)} · {done.at}
        </p>
        <p className="mt-3 text-base">
          <b>{done.present}</b> present · <b>{done.absent}</b> absent · <b>{done.late}</b> late · <b>{done.leave}</b> on leave
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <Link href={backHref} className={buttonClasses("primary", "lg")}>
            Back to sessions
          </Link>
          <Button variant="secondary" size="lg" onClick={() => setDone(null)}>
            Review or change
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-3xl pb-28">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge tone="info">{SESSION_LABEL[session]} session</Badge>
        <span className="text-sm text-muted">{formatDate(date)}</span>
        {saved && (
          <span className="text-xs text-muted">
            Marked by {saved.markedByName ?? "someone"} ·{" "}
            {new Date(saved.markedAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" })} ·{" "}
            {KIND_LABEL[saved.kind] ?? saved.kind}
          </span>
        )}
      </div>

      {lockNote && (
        <p role="note" className="mb-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden /> {lockNote}
        </p>
      )}

      {editable && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="lg" onClick={() => setMarks(Object.fromEntries(students.map((s) => [s.studentId, "present" as Status])))}>
            <UserCheck className="size-5" /> Mark all present
          </Button>
          <span className="text-sm text-muted">Then tap the students who are absent, late or on leave.</span>
        </div>
      )}

      <ul className="divide-y divide-border overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-soft)]">
        {students.map((s) => {
          const m = marks[s.studentId];
          return (
            <li key={s.studentId} className="px-3 py-2.5">
              <div className="mb-1.5 flex items-baseline gap-2">
                <span className="w-7 shrink-0 text-right text-sm tabular-nums text-muted">{s.roll ?? ""}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-navy-900">{s.name}</span>
                {!editable && m && <Badge tone={m === "present" ? "success" : m === "absent" ? "danger" : "warning"}>{STATUS_LABEL[m]}</Badge>}
                {!editable && !m && <span className="text-xs text-muted">Not marked</span>}
              </div>
              {editable && (
                <div role="radiogroup" aria-label={`Attendance for ${s.name}`} className="grid grid-cols-4 gap-1.5">
                  {ORDER.map((st) => (
                    <button
                      key={st}
                      type="button"
                      role="radio"
                      aria-checked={m === st}
                      data-on={m === st}
                      onClick={() => setMarks((x) => ({ ...x, [s.studentId]: st }))}
                      className={cn(
                        "inline-flex min-h-11 items-center justify-center gap-1 rounded-lg border border-border bg-white px-1 text-sm font-medium text-navy-800 active:scale-[0.98]",
                        STATUS_STYLE[st],
                      )}
                    >
                      {m === st && <Check className="size-4" aria-hidden />}
                      {STATUS_LABEL[st]}
                    </button>
                  ))}
                </div>
              )}
            </li>
          );
        })}
        {students.length === 0 && <li className="px-4 py-6 text-center text-sm text-muted">No students are enrolled in this section on this date.</li>}
      </ul>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 px-4 py-3 backdrop-blur lg:left-64">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <p className="min-w-0 flex-1 text-sm" aria-live="polite">
            <b className="text-peacock-700">{counts.present}</b> present · <b className="text-red-700">{counts.absent}</b> absent · <b>{counts.late}</b> late · <b>{counts.leave}</b> leave
            {counts.unmarked > 0 && <span className="text-amber-800"> · {counts.unmarked} not marked</span>}
          </p>
          {editable ? (
            <Button size="lg" loading={busy} disabled={busy || counts.unmarked > 0 || (!changed && !!saved)} onClick={save}>
              {saved ? "Save changes" : "Save attendance"}
            </Button>
          ) : (
            <Link href={backHref} className={buttonClasses("secondary", "lg")}>
              Back
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
