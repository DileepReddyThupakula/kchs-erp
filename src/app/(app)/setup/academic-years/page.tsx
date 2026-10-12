import Link from "next/link";
import { CalendarDays, Star } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import { Badge, Card, EmptyState, PageHeader, Table } from "@/components/ui/card";
import { ConfirmButton } from "@/components/ui/action-form";
import { setCurrentYear } from "@/features/setup/actions";
import { YearForm } from "./year-form";

export const metadata = { title: "Academic years" };

export default async function AcademicYearsPage() {
  const me = await requireStaff();
  const editable = can(me, "setup.edit");
  const supabase = await createClient();
  const { data: years } = await supabase
    .from("academic_years")
    .select("*, holidays(count)")
    .order("start_date", { ascending: false });

  return (
    <>
      <PageHeader icon={<CalendarDays />} title="Academic years & holidays" description="The current year is used by default across the ERP." />
      {years?.length ? (
        <Table>
          <thead>
            <tr>
              <th>Year</th>
              <th>Dates</th>
              <th>Status</th>
              <th>Holidays</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {years.map((y) => (
              <tr key={y.id}>
                <td className="font-medium">
                  <Link href={`/setup/academic-years/${y.id}`} className="text-primary hover:underline">
                    {y.name}
                  </Link>{" "}
                  {y.is_current && <Badge tone="info">Current</Badge>}
                </td>
                <td>
                  {formatDate(y.start_date)} – {formatDate(y.end_date)}
                </td>
                <td className="capitalize">{y.status}</td>
                <td>{(y.holidays as unknown as { count: number }[])[0]?.count ?? 0}</td>
                <td className="text-right">
                  {editable && !y.is_current && (
                    <ConfirmButton
                      action={setCurrentYear}
                      id={y.id}
                      label="Make current"
                      className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-sm font-medium text-navy-700 hover:bg-navy-50"
                      icon={<Star className="size-3.5" />}
                      doneText={`${y.name} is now the current year.`}
                      confirmText={`Make ${y.name} the current academic year?`}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState title="No academic years yet">{editable ? "Add the first academic year below. Its 2nd Saturdays are added as holidays automatically." : "The Admin hasn't set up an academic year yet."}</EmptyState>
      )}
      {editable && (
        <Card className="mt-6">
          <h2 className="mb-3 font-semibold text-navy-900">Add academic year</h2>
          <YearForm />
        </Card>
      )}
    </>
  );
}
