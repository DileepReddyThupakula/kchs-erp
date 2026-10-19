import { notFound, redirect } from "next/navigation";
import { FileBadge } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { getReceiptSchool } from "@/features/fees/receipt-school";
import { todayIst } from "@/features/fees/shared";
import { printFooterText } from "@/features/reports/shared";
import { PageHeader } from "@/components/ui/card";
import { IssueForm } from "@/components/certificates/issue-form";
import { KIND_LABEL, KINDS, type Kind } from "@/features/certificates/shared";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Issue a certificate" };

export default async function IssuePage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const me = await requirePage("/students/certificates");
  if (!(KINDS as string[]).includes(kind)) notFound();
  if (kind === "tc" && me.role !== "admin") redirect("/not-allowed");     // the TC is the Admin's (the database says the same)
  const today = todayIst();
  const school = await getReceiptSchool();
  return (
    <>
      <PageHeader breadcrumbs={[{ label: "Students" }, { label: "Certificates", href: "/students/certificates" }, { label: KIND_LABEL[kind as Kind] }]} icon={<FileBadge />} title={`Issue: ${KIND_LABEL[kind as Kind]}`} description="The number is given only when you press Issue." />
      <IssueForm kind={kind as Kind} today={today} school={school} footer={printFooterText(formatDate(today), me.fullName)} isAdmin={me.role === "admin"} />
    </>
  );
}
