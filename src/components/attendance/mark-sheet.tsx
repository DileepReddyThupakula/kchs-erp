"use client";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Lock, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatDate } from "@/lib/utils";
import { saveAttendance } from "@/features/attendance/actions";
import { KIND_LABEL, SESSION_LABEL, STATUS_LABEL, type SessionName, type Status } from "@/features/attendance/shared";

export type SheetStudent = { studentId: string; admissionNo: string; name: string; roll: number | null };

const KEYS: { status: Status; letter: string; on: string }[] = [
  { status: "present", letter: "P", on: "border-peacock-600 bg-peacock-600 text-white" },
  { status: "absent", letter: "A", on: "border-red-700 bg-red-700 text-white" },
  { status: "late", letter: "L", on: "border-amber-600 bg-amber-500 text-navy-950" },
];

/**
 * Compact register for one session. A student row is ~40px: roll, name and
 * a P / A / L segmented control. Sessions open with everyone Present (first
 * time) and Save stays in the sticky bar. Read-only when locked / not yours.
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
  const initial = (id: string): Status | undefined => (saved?.rows[id]?.status as Status | undefined) ?? (editable && !saved ? "present" : undefined);
  const [marks, setMarks] = useState<Record<string, Status | undefined>>(() => Object.fromEntries(students.map((s) => [s.studentId, initial(s.studentId)])));
  const [baseline, setBaseline] = useState<Record<string, Status | undefined>>(() => (saved ? Object.fromEntries(students.map((s) => [s.studentId, initial(s.studentId)])) : {}));
  const [everSaved, setEverSaved] = useState(!!saved);
  const [savedAt, setSavedAt] = useState<string | null>(saved ? timeOf(saved.markedAt) : null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const listRef = useRef<HTMLUListElement>(null);

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, unmarked: 0 };
    for (const s of students) {
      const m = marks[s.studentId];
      if (m) c[m]++;
      else c.unmarked++;
    }
    return c;
  }, [marks, students]);
  const dirty = !everSaved || students.some((s) => marks[s.studentId] !== baseline[s.studentId]);
  const shown = query.trim()
    ? students.filter((s) => `${s.name} ${s.admissionNo} ${s.roll ?? ""}`.toLowerCase().includes(query.trim().toLowerCase()))
    : students;

  const set = (id: string, st: Status) => setMarks((m) => ({ ...m, [id]: st }));

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
    const at = timeOf(new Date().toISOString());
    setBaseline({ ...marks });
    setEverSaved(true);
    setSavedAt(at);
    toast.success(`Saved ${sectionLabel}, ${SESSION_LABEL[session].toLowerCase()}`, {
      description: `${res.counts!.present} present · ${res.counts!.absent} absent · ${res.counts!.late} late · ${at}`,
    });
    router.refresh();
  }

  function onRowKey(e: React.KeyboardEvent<HTMLLIElement>, id: string) {
    if ((e.target as HTMLElement).tagName === "INPUT") return;
    const rows = [...(listRef.current?.querySelectorAll<HTMLElement>("[data-row]") ?? [])];
    const i = rows.indexOf(e.currentTarget);
    if (e.key === "ArrowDown") {
      e.preventDefault();
      rows[Math.min(rows.length - 1, i + 1)]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      rows[Math.max(0, i - 1)]?.focus();
    } else if (editable && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const k = KEYS.find((x) => x.letter.toLowerCase() === e.key.toLowerCase());
      if (k) {
        e.preventDefault();
        set(id, k.status);
      }
    }
  }

  return (
    <div>
      {/* sticky bar: where we are, live counts, Save */}
      <div className="sticky top-16 z-20 -mx-4 border-b border-border bg-surface/95 px-4 py-2 backdrop-blur lg:top-[3.1rem] lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href={backHref} aria-label="Back to sessions" className="grid size-9 place-items-center rounded-lg text-navy-700 hover:bg-navy-50">
            <ArrowLeft className="size-5" aria-hidden />
          </Link>
          <div className="min-w-[10rem] flex-1">
            <p className="font-semibold text-navy-900">
              {sectionLabel} · {SESSION_LABEL[session]}
            </p>
            <p className="text-xs text-muted">{formatDate(date)}</p>
          </div>
          <p className="flex items-center gap-3 text-sm tabular-nums" aria-live="polite">
            <span>
              <b className="text-peacock-700">{counts.present}</b> Present
            </span>
            <span>
              <b className="text-red-700">{counts.absent}</b> Absent
            </span>
            <span>
              <b className="text-amber-700">{counts.late}</b> Late
            </span>
          </p>
          {editable ? (
            <div className="flex items-center gap-2">
              <span className={cn("text-xs font-medium", dirty ? "text-amber-800" : "text-peacock-700")} role="status">
                {dirty ? (everSaved ? "Unsaved changes" : "Not saved yet") : `Saved ${savedAt ?? ""}`}
              </span>
              <Button loading={busy} disabled={busy || !dirty || counts.unmarked > 0} onClick={save}>
                Save
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted">Read only</span>
          )}
        </div>
      </div>

      {lockNote && (
        <p role="note" className="mt-3 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden /> {lockNote}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <label className="relative">
          <span className="sr-only">Search students</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a student"
            className="h-9 w-56 rounded-lg border border-border bg-surface pl-8 pr-2 text-sm outline-none focus:border-navy-400"
          />
        </label>
        {editable && (
          <Button variant="secondary" size="sm" onClick={() => setMarks(Object.fromEntries(students.map((s) => [s.studentId, "present" as Status])))}>
            Mark all present
          </Button>
        )}
        {saved && (
          <span className="text-xs text-muted">
            Last saved by {saved.markedByName ?? "someone"} · {KIND_LABEL[saved.kind] ?? saved.kind}
          </span>
        )}
        {editable && <span className="hidden text-xs text-muted lg:inline">Keys: ↑ ↓ move · P present · A absent · L late</span>}
      </div>

      {error && (
        <p role="alert" className="mt-3 rounded-lg border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}

      {/* two columns on wide screens, filled top-to-bottom so roll numbers read down each column */}
      <ul
        ref={listRef}
        style={{ ["--rows" as string]: Math.max(1, Math.ceil(shown.length / 2)) }}
        className="mt-3 grid grid-cols-1 gap-x-4 lg:grid-flow-col lg:grid-cols-2 lg:grid-rows-[repeat(var(--rows),minmax(0,auto))]"
        aria-label="Students"
      >
        {shown.map((s) => {
          const m = marks[s.studentId];
          const changed = editable && everSaved && m !== baseline[s.studentId];
          return (
            <li
              key={s.studentId}
              data-row
              tabIndex={0}
              onKeyDown={(e) => onRowKey(e, s.studentId)}
              className={cn(
                "flex min-h-11 items-center gap-2 border-b border-border px-2 outline-none focus-visible:bg-gold-50 focus-visible:ring-2 focus-visible:ring-gold-500",
                changed && "bg-amber-50/70",
              )}
            >
              <span className="w-7 shrink-0 text-right text-sm tabular-nums text-muted">{s.roll ?? ""}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-navy-900">{s.name}</span>
              {editable ? (
                <span role="radiogroup" aria-label={`Attendance for ${s.name}`} className="inline-flex shrink-0 gap-1">
                  {KEYS.map((k) => (
                    <button
                      key={k.status}
                      type="button"
                      role="radio"
                      tabIndex={-1}
                      aria-checked={m === k.status}
                      aria-label={STATUS_LABEL[k.status]}
                      onClick={() => set(s.studentId, k.status)}
                      className={cn(
                        "grid size-10 place-items-center rounded-lg border text-sm font-semibold lg:size-8 lg:rounded-md",
                        m === k.status ? k.on : "border-border bg-white text-navy-700 hover:bg-navy-50",
                      )}
                    >
                      {k.letter}
                    </button>
                  ))}
                </span>
              ) : (
                <span className="shrink-0 text-sm font-medium">{m ? STATUS_LABEL[m] : <span className="text-muted">Not marked</span>}</span>
              )}
            </li>
          );
        })}
        {shown.length === 0 && <li className="col-span-full px-3 py-6 text-center text-sm text-muted">{students.length ? "No student matches your search." : "No students are enrolled in this section on this date."}</li>}
      </ul>
    </div>
  );
}

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });
}
