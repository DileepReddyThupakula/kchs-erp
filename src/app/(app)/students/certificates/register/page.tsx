import Link from "next/link";
import { ListChecks, Printer } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYears } from "@/lib/settings";
import { EmptyState, PageHeader, Badge } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button-classes";
import { CancelCertificate, RegisterExport } from "@/components/certificates/register-tools";
import { fmtDate, KIND_SHORT, KINDS, LANG_LABEL, type Kind, type Lang } from "@/features/certificates/shared";

export const metadata = { title: "Certificate register" };

type Row = { id: string; seq: number; number: string; student: string; admission_no: string; issue_date: string; issued_by: string | null; status: "issued" | "cancelled"; language: Lang; purpose: string | null;
  copies: number; prints: { copy_no: number; at: string; duplicate: boolean; reason: string | null; by: string | null }[]; cancel_reason: string | null };

/** The register of one type for one year. The Admin sees all three; an office person with the duty sees bonafide and study only (the database decides). */
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ kind?: string; year?: string }> }) {
  const me = await requirePage("/students/certificates");
  const sp = await searchParams;
  const admin = me.role === "admin";
  const kinds = KINDS.filter((k) => admin || k !== "tc");
  const kind = (kinds.find((k) => k === sp.kind) ?? kinds[0]) as Kind;
  const years = await getAcademicYears();
  const year = years.find((y) => y.id === sp.year) ?? years.find((y) => y.is_current) ?? years[0];
  const supabase = await createClient();
  const { data, error } = year ? await supabase.rpc("certificate_register", { p_kind: kind, p_year: year.id, p_limit: 500 }) : { data: null, error: null };
  const reg = data as unknown as { total: number; rows: Row[]; series: { start_no: number; next_no: number } | null } | null;
  let sections: { id: string; label: string }[] = [];
  if (admin && kind === "tc" && year) {
    const { data: secs } = await supabase.from("sections").select("id, name, classes(name, sort_order)").eq("academic_year_id", year.id);
    sections = (secs ?? []).map((s) => ({ id: s.id, label: `${(s.classes as unknown as { name: string })?.name ?? ""} ${s.name}`, order: (s.classes as unknown as { sort_order: number })?.sort_order ?? 0 })).sort((a, b) => a.order - b.order || a.label.localeCompare(b.label)).map(({ id, label }) => ({ id, label }));
  }
  const q = (k: string, y: string) => `/students/certificates/register?kind=${k}&year=${y}`;
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Students" }, { label: "Certificates", href: "/students/certificates" }, { label: "Register" }]} icon={<ListChecks />} title="Certificate register"
        description={year ? `${KIND_SHORT[kind]} certificates of ${year.name}${reg?.series ? ` · numbering started at ${reg.series.start_no}, next number ${reg.series.next_no}` : ""}` : "No academic year"} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <nav aria-label="Certificate type" className="flex gap-1">
          {kinds.map((k) => <Link key={k} href={q(k, year?.id ?? "")} aria-current={k === kind ? "page" : undefined} className={buttonClasses(k === kind ? "primary" : "secondary", "md")}>{KIND_SHORT[k]}</Link>)}
        </nav>
        <form method="get" className="flex items-end gap-2">
          <input type="hidden" name="kind" value={kind} />
          <label className="text-xs text-muted">Academic year
            <select name="year" defaultValue={year?.id} className="ml-2 h-10 rounded-lg border border-border bg-surface px-2.5 text-sm shadow-sm">{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select>
          </label>
          <button type="submit" className={buttonClasses("secondary")}>Show</button>
        </form>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {year && <a href={`/print/certificate-register?kind=${kind}&year=${year.id}`} target="_blank" rel="noopener" className={buttonClasses("secondary")}><Printer className="size-4" aria-hidden /> Print A4</a>}
          {year && <RegisterExport kind={kind} year={year.id} disabled={!reg?.rows.length} />}
        </div>
      </div>
      {error || !reg || reg.rows.length === 0 ? (
        <EmptyState title="No certificates">{error ? "You do not have access to this register." : `No ${KIND_SHORT[kind].toLowerCase()} certificate has been issued in ${year?.name ?? "this year"}.`}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-soft)]">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-cream-50 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-3 py-2">Number</th><th className="px-3 py-2">Student</th><th className="px-3 py-2">Date</th><th className="px-3 py-2">Issued by</th><th className="px-3 py-2">Copies</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y divide-border">
              {reg.rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-navy-900">{r.number}</td>
                  <td className="px-3 py-2">{r.student} <span className="text-xs text-muted">{r.admission_no}</span>{r.purpose && <span className="block text-xs text-muted">For {r.purpose}</span>}</td>
                  <td className="whitespace-nowrap px-3 py-2">{fmtDate(r.issue_date)}</td>
                  <td className="px-3 py-2">{r.issued_by ?? "—"}</td>
                  <td className="px-3 py-2"><span className="tabular-nums">{r.copies}</span>
                    <ul className="text-xs text-muted">{r.prints.map((p) => <li key={p.copy_no}>#{p.copy_no} {fmtDate(p.at)} · {LANG_LABEL[r.language] && p.duplicate ? `duplicate (${(p.reason ?? "").replace("_", " ")})` : "original / same-day reprint"}</li>)}</ul></td>
                  <td className="px-3 py-2">{r.status === "issued" ? <Badge tone="success">Issued</Badge> : <Badge tone="danger">Cancelled</Badge>}{r.cancel_reason && <span className="block text-xs text-muted">{r.cancel_reason}</span>}</td>
                  <td className="px-3 py-2 text-right">
                    {r.status === "issued" && <Link href={`/print/certificate/${r.id}`} target="_blank" className="mr-3 text-xs font-medium text-navy-700 underline">Print</Link>}
                    {admin && r.status === "issued" && <CancelCertificate id={r.id} number={r.number} sections={sections} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
