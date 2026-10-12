import { Wallet } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { getFeeHeads, getStudentLookup } from "@/features/fees/queries";
import { CollectClient } from "./client";

export const metadata = { title: "Collect fee" };

export default async function CollectFeePage({ searchParams }: { searchParams: Promise<{ student?: string }> }) {
  const { student } = await searchParams;
  const me = await requirePage("/fees/collect");
  const year = await resolveYear();
  const header = <PageHeader breadcrumbs={[{ label: "Fees" }, { label: "Collect fee" }]} icon={<Wallet />} title="Collect fee" description="Search a student, choose what is being paid, save, and print the receipt." />;
  if (!year) return (<>{header}<EmptyState title="No academic year yet">Ask the Admin to set up the current academic year.</EmptyState></>);
  const supabase = await createClient();
  const [lookup, { regular }] = await Promise.all([getStudentLookup(supabase, year.id), getFeeHeads(supabase)]);
  return (
    <>
      {header}
      <CollectClient
        students={lookup.map((s) => ({ id: s.id, name: s.name, adm: s.adm, classLabel: s.classLabel, phones: s.phones, status: s.status }))}
        initialStudent={student}
        isAdmin={can(me, "fees.setup")}
        miscHeads={regular.filter((h) => h.is_active).map((h) => ({ id: h.id, name: h.name }))}
      />
    </>
  );
}
