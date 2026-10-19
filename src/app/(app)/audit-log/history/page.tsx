import Link from "next/link";
import { History } from "lucide-react";
import { requireCapability } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui/card";
import { buttonClasses } from "@/components/ui/button-classes";
import { AuditEntryList } from "@/components/audit/entry-list";
import { getRecordHistory } from "@/features/audit/queries";

export const metadata = { title: "History" };

const TABLES: Record<string, { label: string; back: (id: string) => string }> = {
  students: { label: "student", back: (id) => `/students/${id}` },
  fee_receipts: { label: "receipt", back: (id) => `/fees/receipts/${id}` },
  staff: { label: "staff member", back: (id) => `/staff/${id}` },
};

/** Every change to ONE record, newest first. Admin only (checked before anything loads). */
export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ table?: string; record?: string }> }) {
  await requireCapability("audit.view");
  const { table = "", record = "" } = await searchParams;
  const t = TABLES[table];
  const supabase = await createClient();
  const rows = t && record ? await getRecordHistory(supabase, table, record) : [];
  const name = rows.find((r) => r.record_label)?.record_label;
  return (
    <>
      <PageHeader
        breadcrumbs={[{ label: "Administration" }, { label: "Audit log", href: "/audit-log" }, { label: "History" }]}
        icon={<History />}
        title={`History of this ${t?.label ?? "record"}${name ? `: ${name}` : ""}`}
        description="Every change, newest first. Only the fields that changed are shown; ID numbers are masked."
        actions={t && record ? <Link href={t.back(record)} className={buttonClasses("secondary")}>Back to the {t.label}</Link> : undefined}
      />
      {rows.length === 0 ? <EmptyState title="No history">Nothing has been recorded for this record.</EmptyState> : <AuditEntryList rows={rows} />}
    </>
  );
}
