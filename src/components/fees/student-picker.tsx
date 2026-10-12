"use client";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type PickerStudent = { id: string; name: string; adm: string; classLabel: string; phones?: string[]; status?: string };

/**
 * Search-and-select list of students. multiple = checkboxes (selected shown as
 * chips); single = pick one. Shows at most 40 matches at a time.
 */
export function StudentPicker({
  students,
  value,
  onChange,
  multiple = false,
  disabled = false,
  placeholder = "Search name, admission no or phone…",
}: {
  students: PickerStudent[];
  value: string[];
  onChange: (ids: string[]) => void;
  multiple?: boolean;
  disabled?: boolean;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(students.map((s) => [s.id, s])), [students]);
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t
      ? students.filter((s) => `${s.name} ${s.adm} ${s.classLabel} ${(s.phones ?? []).join(" ")}`.toLowerCase().includes(t))
      : students;
    return list.slice(0, 40);
  }, [students, q]);
  const selected = new Set(value);
  const toggle = (id: string) => {
    if (disabled) return;
    if (!multiple) return onChange([id]);
    onChange(selected.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.slice(0, multiple ? 60 : 1).map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full bg-gold-100 py-0.5 pl-2.5 pr-1 text-xs font-medium text-gold-800 ring-1 ring-inset ring-gold-200">
              {byId.get(id)?.name ?? "Student"} <span className="font-mono text-[10px] opacity-70">{byId.get(id)?.adm}</span>
              {!disabled && (
                <button type="button" onClick={() => onChange(value.filter((v) => v !== id))} className="grid size-5 place-items-center rounded-full hover:bg-gold-200" aria-label="Remove">
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
          {multiple && value.length > 60 && <span className="text-xs text-muted">+{value.length - 60} more</span>}
          {multiple && value.length > 0 && !disabled && (
            <button type="button" className="text-xs font-medium text-navy-700 hover:underline" onClick={() => onChange([])}>
              Clear all
            </button>
          )}
        </div>
      )}
      <label className="relative block">
        <span className="sr-only">Search students</span>
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" aria-hidden />
        <input
          type="search"
          value={q}
          disabled={disabled}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-navy-500 focus:ring-3 focus:ring-gold-300/40 disabled:bg-cream-100"
        />
      </label>
      <ul className="max-h-56 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-surface text-sm" role="listbox" aria-multiselectable={multiple}>
        {matches.length === 0 && <li className="px-3 py-3 text-center text-muted">No students match.</li>}
        {matches.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              role="option"
              aria-selected={selected.has(s.id)}
              disabled={disabled}
              onClick={() => toggle(s.id)}
              className={cn("flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-cream-50", selected.has(s.id) && "bg-gold-50")}
            >
              {multiple && <input type="checkbox" readOnly checked={selected.has(s.id)} className="accent-navy-700" tabIndex={-1} />}
              <span className="flex-1 truncate">
                <span className="font-medium text-navy-900">{s.name}</span>
                <span className="ml-2 font-mono text-xs text-muted">{s.adm}</span>
              </span>
              <span className="whitespace-nowrap text-xs text-muted">{s.classLabel}</span>
            </button>
          </li>
        ))}
      </ul>
      {students.length > 40 && <p className="text-[11px] text-muted">Showing up to 40 matches. Type to narrow down.</p>}
    </div>
  );
}
