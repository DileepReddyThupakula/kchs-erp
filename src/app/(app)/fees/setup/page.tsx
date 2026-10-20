import { Settings } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { getAcademicYears, resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { LinkTabs } from "@/components/ui/tabs";
import { YearPicker } from "@/components/ui/year-picker";
import { getFeeSettings, getStudentLookup } from "@/features/fees/queries";
import type { FeeCampaign, FeeHead, FeePlan, FeePlanInstallment } from "@/types/database";
import { getSectionOptions } from "@/features/students/queries";
import { AmountsTab } from "./amounts-tab";
import { HeadsTab } from "./heads-tab";
import { PaymentsTab } from "./payments-tab";
import { PlansTab } from "./plans-tab";
import { SpecialTab, type CampaignRow } from "./special-tab";
import { RegenerateButton } from "./regenerate";

export const metadata = { title: "Fee setup" };

export default async function FeeSetupPage({ searchParams }: { searchParams: Promise<{ year?: string; tab?: string }> }) {
  const { year: yearParam, tab = "amounts" } = await searchParams;
  await requirePage("/fees/setup");
  const supabase = await createClient();
  const [years, year] = await Promise.all([getAcademicYears(), resolveYear(yearParam)]);
  const header = (
    <PageHeader
      breadcrumbs={[{ label: "Fees" }, { label: "Fee setup" }]}
      icon={<Settings />}
      title="Fee setup"
      description="Fee heads, amounts per class, payment plans and special fees. Changes update unpaid dues; paid amounts are never changed."
      actions={
        <>
          <YearPicker years={years} value={year?.id} />
          {year && <RegenerateButton yearId={year.id} />}
        </>
      }
    />
  );
  if (!year) return (<>{header}<EmptyState title="No academic year yet">Create an academic year first.</EmptyState></>);

  const q = (t: string) => `/fees/setup?tab=${t}&year=${year.id}`;
  // ONE database call for every tab: heads, classes, plans, amounts, special fees and the plan instalments
  const { data: bundle } = await supabase.rpc("fees_setup_page", { p_year: year.id });
  const b = (bundle as unknown as { heads: FeeHead[]; special: string[]; classes: { id: string; name: string; sort_order: number; is_active: boolean }[]; plans: FeePlan[]; structure: { class_id: string; fee_head_id: string; amount_paise: number; default_plan_id: string | null }[]; campaigns: FeeCampaign[]; installments: FeePlanInstallment[] } | null)
    ?? { heads: [], special: [], classes: [], plans: [], structure: [], campaigns: [], installments: [] };
  const all = b.heads;
  const special = new Set(b.special);
  const regular = all.filter((h) => !special.has(h.id));
  const classes = b.classes;
  const plans = b.plans;
  const structure = b.structure;
  const campaigns = b.campaigns;
  const installments = b.installments;

  return (
    <>
      {header}
      <LinkTabs
        current={tab}
        tabs={[
          { id: "amounts", label: "Amounts per class", href: q("amounts") },
          { id: "heads", label: "Fee heads", href: q("heads"), count: regular.length },
          { id: "plans", label: "Plans & schedules", href: q("plans"), count: plans.filter((p) => !p.name.startsWith("Special: ")).length },
          { id: "special", label: "Special fees", href: q("special"), count: campaigns.length },
          { id: "payments", label: "Payment QR", href: q("payments") },
        ]}
      />
      {tab === "heads" && <HeadsTab heads={regular} />}
      {tab === "payments" && <PaymentsTab settings={await getFeeSettings(supabase)} />}
      {tab === "plans" && (
        <PlansTab
          yearId={year.id}
          plans={plans.filter((p) => !p.name.startsWith("Special: "))}
          installments={installments}
        />
      )}
      {tab === "special" && (
        <SpecialTabLoader
          yearId={year.id}
          yearName={year.name}
          campaigns={campaigns}
          classes={classes.filter((c) => c.is_active)}
          heads={all}
          special={special}
        />
      )}
      {tab !== "heads" && tab !== "plans" && tab !== "special" && tab !== "payments" && (
        <AmountsTab
          yearId={year.id}
          yearName={year.name}
          classes={classes.filter((c) => c.is_active).map((c) => ({ id: c.id, name: c.name, order: c.sort_order }))}
          heads={regular.filter((h) => h.is_active).map((h) => ({ id: h.id, name: h.name }))}
          plans={plans.filter((p) => p.is_active && !p.name.startsWith("Special: ")).map((p) => ({ id: p.id, name: p.name, kind: p.kind }))}
          structure={structure.map((s) => ({ classId: s.class_id, headId: s.fee_head_id, amount: Number(s.amount_paise), planId: s.default_plan_id }))}
        />
      )}
    </>
  );
}

async function SpecialTabLoader({
  yearId,
  yearName,
  campaigns,
  classes,
  heads,
  special,
}: {
  yearId: string;
  yearName: string;
  campaigns: Awaited<ReturnType<typeof loadCampaigns>>["campaigns"];
  classes: { id: string; name: string; sort_order: number }[];
  heads: { id: string; name: string }[];
  special: Set<string>;
}) {
  void heads;
  void special;
  const supabase = await createClient();
  const [sections, lookup, data] = await Promise.all([getSectionOptions(supabase, yearId), getStudentLookup(supabase, yearId), loadCampaigns(supabase, campaigns, yearId)]);
  return (
    <SpecialTab
      yearId={yearId}
      yearName={yearName}
      rows={data.rows}
      classes={classes.map((c) => ({ id: c.id, name: c.name }))}
      sections={sections.map((s) => ({ id: s.id, label: s.label }))}
      students={lookup.filter((s) => s.status === "active").map((s) => ({ id: s.id, name: s.name, adm: s.adm, classLabel: s.classLabel, phones: s.phones }))}
    />
  );
}

type Supa = Awaited<ReturnType<typeof createClient>>;
async function loadCampaigns(
  supabase: Supa,
  campaigns: { id: string; fee_head_id: string; plan_id: string; name: string; description: string | null; amount_mode: "flat" | "per_class"; amount_paise: number | null; audience: "all" | "classes" | "sections" | "students"; audience_ids: string[]; apply_concessions: boolean; status: "active" | "cancelled"; cancel_reason: string | null; created_at: string }[],
  yearId: string,
) {
  void yearId;
  const headIds = campaigns.map((c) => c.fee_head_id);
  const ids = campaigns.map((c) => c.id);
  const [dues, members, classAmounts, insts] = await Promise.all([
    headIds.length
      ? fetchAll((f, t) => supabase.from("student_fee_dues").select("fee_head_id, amount_paise, concession_paise, paid_paise, voided_at").in("fee_head_id", headIds).range(f, t))
      : Promise.resolve([]),
    ids.length ? fetchAll((f, t) => supabase.from("fee_campaign_students").select("campaign_id").in("campaign_id", ids).range(f, t)) : Promise.resolve([]),
    ids.length ? supabase.from("fee_campaign_class_amounts").select("campaign_id, class_id, amount_paise").in("campaign_id", ids).then((r) => r.data ?? []) : Promise.resolve([]),
    campaigns.length ? supabase.from("fee_plan_installments").select("plan_id, seq, label, due_date, share_bp").in("plan_id", campaigns.map((c) => c.plan_id)).order("seq").then((r) => r.data ?? []) : Promise.resolve([]),
  ]);
  const rows: CampaignRow[] = campaigns.map((c) => {
    const mine = dues.filter((d) => d.fee_head_id === c.fee_head_id && !d.voided_at);
    const total = mine.reduce((a, d) => a + Number(d.amount_paise) - Number(d.concession_paise), 0);
    const paid = mine.reduce((a, d) => a + Number(d.paid_paise), 0);
    const inst = insts.filter((i) => i.plan_id === c.plan_id);
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      amountMode: c.amount_mode,
      amount: c.amount_paise === null ? null : Number(c.amount_paise),
      classAmounts: Object.fromEntries(classAmounts.filter((a) => a.campaign_id === c.id).map((a) => [a.class_id, Number(a.amount_paise)])),
      audience: c.audience,
      audienceIds: c.audience_ids,
      applyConcessions: c.apply_concessions,
      status: c.status,
      cancelReason: c.cancel_reason,
      students: members.filter((m) => m.campaign_id === c.id).length,
      total,
      paid,
      installments: inst.map((i) => ({ label: i.label, dueDate: i.due_date, shareBp: i.share_bp })),
      createdAt: c.created_at,
    };
  });
  return { campaigns, rows };
}
