import Link from "next/link";
import { ListChecks, Printer } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYears } from "@/lib/settings";
import { Badge, EmptyState, PageHeader } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button-classes";
import { CardActions, RegisterExport } from "@/components/id-cards/register-tools";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "ID card register" };

type Row = { id: string; seq: number; number: string; student: string; admission_no: string; class: string; section: string; status: "issued" | "cancelled"; issued_by: string | null; issued_at: string;
  cancel_kind: string | null; cancel_reason: string | null; photo_pending: boolean; replaced_by: string | null; replaces: string | null; prints: number };

/** Every card of a year, newest numbers last. Replace needs a reason; only the Admin can cancel. */
export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const me = await requirePage("/students/id-cards");
  const sp = await searchParams;
  const years = await getAcademicYears();
  const year = years.find((y) => y.id === sp.year) ?? years.find((y) => y.is_current) ?? years[0];
  const supabase = await createClient();
  const { data, error } = year ? await supabase.rpc("id_card_register", { p_year: year.id, p_limit: 500 }) : { data: null, error: null };
  const reg = data as unknown as { total: number; rows: Row[]; next_no: number | null } | null;
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Students" }, { label: "ID cards", href: "/students/id-cards" }, { label: "Register" }]} icon={<ListChecks />} title="ID card register" description={year ? `Cards of ${year.name}${reg?.next_no ? ` · next number ${reg.next_no}` : ""}` : "No academic year"} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <form method="get" className="flex items-end gap-2">
          <label className="text-xs text-muted">Academic year
            <select name="year" defaultValue={year?.id} className="ml-2 h-10 rounded-lg border border-border bg-surface px-2.5 text-sm shadow-sm">{years.map((y) => <option key={y.id} value={y.id}>{y.name}</option>)}</select>
          </label>
          <button type="submit" className={buttonClasses("secondary")}>Show</button>
        </form>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {year && <a href={`/print/id-card-register?year=${year.id}`} target="_blank" rel="noopener" className={buttonClasses("secondary")}><Printer className="size-4" aria-hidden /> Print A4</a>}
          {year && <RegisterExport year={year.id} disabled={!reg?.rows.length} />}
        </div>
      </div>
      {error || !reg || reg.rows.length === 0 ? (
        <EmptyState title="No cards">{error ? "You do not have access to this register." : `No ID card has been issued in ${year?.name ?? "this year"}.`}</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-soft)]">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-cream-50 text-left text-xs uppercase tracking-wide text-muted"><tr><th className="px-3 py-2">Number</th><th className="px-3 py-2">Student</th><th className="px-3 py-2">Class</th><th className="px-3 py-2">Issued</th><th className="px-3 py-2">Prints</th><th className="px-3 py-2">Status</th><th className="px-3 py-2" /></tr></thead>
            <tbody className="divide-y divide-border">
              {reg.rows.map((r) => (
                <tr key={r.id} className="align-top" data-status={r.status}>
                  <td className="whitespace-nowrap px-3 py-2 font-medium text-navy-900">{r.number}{r.replaces && <span className="block text-xs font-normal text-muted">replaces {r.replaces}</span>}</td>
                  <td className="px-3 py-2">{r.student} <span className="text-xs text-muted">{r.admission_no}</span>{r.photo_pending && <Badge tone="warning" className="ml-1">Photo pending</Badge>}</td>
                  <td className="px-3 py-2">{r.class} {r.section}</td>
                  <td className="whitespace-nowrap px-3 py-2">{formatDate(String(r.issued_at).slice(0, 10))}<span className="block text-xs text-muted">{r.issued_by}</span></td>
                  <td className="px-3 py-2 tabular-nums">{r.prints}</td>
                  <td className="px-3 py-2">{r.status === "issued" ? <Badge tone="success">Issued</Badge> : <span className="font-semibold text-red-700">Cancelled</span>}
                    {r.status === "cancelled" && <span className="block text-xs text-muted">{String(r.cancel_kind).replace(/_/g, " ")}{r.cancel_reason ? `: ${r.cancel_reason}` : ""}{r.replaced_by ? ` · replaced by ${r.replaced_by}` : ""}</span>}</td>
                  <td className="px-3 py-2 text-right">
                    {r.status === "issued" && (
                      <div className="space-y-1.5">
                        <Link href={`/print/id-cards?cards=${r.id}`} target="_blank" className="text-xs font-medium text-navy-700 underline">Print again</Link>
                        <CardActions id={r.id} number={r.number} isAdmin={me.role === "admin"} noPhoto={r.photo_pending} />
                      </div>
                    )}
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
