import Link from "next/link";
import { ArrowUpCircle } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { getAcademicYears } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button-classes";
import { PromotionClient } from "./client";
import { UndoClient } from "./undo-client";
import type { Preview, RunInfo } from "@/features/promotion/shared";
import { buildPlan, emptyEdits } from "@/features/promotion/shared";

export const metadata = { title: "Promotion" };

export default async function PromotionPage({ searchParams }: { searchParams: Promise<{ to?: string }> }) {
  await requirePage("/students/promotion"); // Admin only: checked before anything is read
  const { to } = await searchParams;
  const years = await getAcademicYears();
  const current = years.find((y) => y.is_current);
  const header = (desc: string) => (
    <PageHeader breadcrumbs={[{ label: "Students" }, { label: "Promotion" }]} icon={<ArrowUpCircle />} title="Promotion / year rollover" description={desc} />
  );
  const supabase = await createClient();
  const { data: runsData } = await supabase.rpc("rollover_runs_list");
  const runs = (runsData as unknown as RunInfo[] | null) ?? [];

  const target = (to && years.find((y) => y.id === to)) || years.filter((y) => current && y.start_date > current.start_date && y.status === "planned").sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  const applied = target ? runs.find((r) => r.to_year_id === target.id && r.status === "applied") : undefined;
  const latestApplied = !applied ? runs.find((r) => r.status === "applied") : undefined;

  if (applied || (!target && latestApplied)) {
    const run = (applied ?? latestApplied)!;
    return (
      <>
        {header(`The year ${run.to} has started. Old-year records are exactly as they were.`)}
        <UndoClient run={run} />
        <Link href="/students" className={buttonClasses("secondary")}>Go to students</Link>
      </>
    );
  }
  if (!current || !target) {
    return (
      <>
        {header("Move students to the next class at the end of the year.")}
        <EmptyState title="Create the next academic year first" action={<Link href="/setup/academic-years" className={buttonClasses("primary")}>Academic years &amp; holidays</Link>}>
          The rollover needs a current year and a planned next year (with its dates). Add the next year, then come back here.
        </EmptyState>
      </>
    );
  }
  const [{ data: pv, error }, { data: settings }, { data: staff }] = await Promise.all([
    supabase.rpc("rollover_preview", { p_from: current.id, p_to: target.id, p_plan: JSON.parse(JSON.stringify(buildPlan(emptyEdits()))) }),
    supabase.from("school_settings").select("mediums").eq("id", 1).single(),
    supabase.from("staff").select("id, full_name").eq("status", "active").order("full_name"),
  ]);
  if (error || !pv) {
    return <>{header("Move students to the next class at the end of the year.")}<EmptyState title="The preview could not be made">Nothing was changed. Try again, or check the academic years.</EmptyState></>;
  }
  return (
    <>
      {header(`Moving from ${current.name} to ${target.name}. Nothing is applied until you press Confirm.`)}
      <PromotionClient initial={pv as unknown as Preview} mediums={settings?.mediums ?? []} staff={(staff ?? []).map((s) => ({ id: s.id, name: s.full_name }))} />
    </>
  );
}
