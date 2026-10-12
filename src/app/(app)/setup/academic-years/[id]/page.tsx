import { notFound } from "next/navigation";
import { CalendarDays, RefreshCw } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/action-form";
import { deleteHoliday, regenerateSecondSaturdays } from "@/features/setup/actions";
import { YearForm } from "../year-form";
import { HolidayForm } from "./holiday-form";

export default async function AcademicYearPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const me = await requireStaff();
  const editable = can(me, "setup.edit");
  const supabase = await createClient();
  const [{ data: year }, { data: holidays }] = await Promise.all([
    supabase.from("academic_years").select("*").eq("id", id).maybeSingle(),
    supabase.from("holidays").select("*").eq("academic_year_id", id).order("date"),
  ]);
  if (!year) notFound();

  return (
    <>
      <PageHeader
        icon={<CalendarDays />}
        title={`Academic year ${year.name}`}
        description={`${formatDate(year.start_date)} – ${formatDate(year.end_date)}`}
        actions={
          editable && (
            <ConfirmButton
              action={regenerateSecondSaturdays}
              id={year.id}
              label="Add missing 2nd Saturdays"
              icon={<RefreshCw className="size-4" />}
              doneText="2nd Saturdays checked."
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-navy-800 shadow-sm hover:border-navy-200 hover:bg-navy-50"
            />
          )
        }
      />
      {editable && (
        <Card className="mb-6">
          <h2 className="mb-3 font-semibold text-navy-900">Edit year</h2>
          <YearForm year={year} />
        </Card>
      )}

      <h2 className="mb-2 font-semibold text-navy-900">Holidays ({holidays?.length ?? 0})</h2>
      {editable && (
        <Card className="mb-3">
          <HolidayForm yearId={year.id} min={year.start_date} max={year.end_date} />
        </Card>
      )}
      {holidays?.length ? (
        <Table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Day</th>
              <th>Holiday</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {holidays.map((h) => (
              <tr key={h.id}>
                <td>{formatDate(h.date)}</td>
                <td>{new Date(h.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short" })}</td>
                <td>
                  {h.name} {h.kind === "second_saturday" && <Badge tone="gold">Auto</Badge>}
                </td>
                <td className="text-right">
                  {editable && <ConfirmButton action={deleteHoliday} id={h.id} label="Remove" doneText="Holiday removed." confirmText={`Remove holiday on ${formatDate(h.date)}?`} />}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No holidays yet">Add holidays such as Sankranti or Dasara above.</EmptyState>
      )}
    </>
  );
}
