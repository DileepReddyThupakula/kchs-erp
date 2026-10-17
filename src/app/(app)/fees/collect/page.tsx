import { getReceiptSchool } from "@/features/fees/receipt-school";
import { Wallet } from "lucide-react";
import { requirePage } from "@/features/students/page-guard";
import { can } from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import { resolveYear } from "@/lib/settings";
import { EmptyState, PageHeader } from "@/components/ui/card";
import { getCollectPage, getReceiptDetail, getStudentLookup } from "@/features/fees/queries";
import { todayIst } from "@/features/fees/shared";
import type { CollectShow } from "@/features/fees/collect-list";
import { CollectList } from "./list";
import { CollectPanel } from "./client";

export const metadata = { title: "Collect fee" };

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CollectFeePage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; class?: string; section?: string; show?: string; saved?: string }>;
}) {
  const sp = await searchParams;
  const me = await requirePage("/fees/collect"); // Admin or fee_collection duty, before any data loads
  const year = await resolveYear();
  const header = (
    <PageHeader
      breadcrumbs={[{ label: "Fees" }, { label: "Collect fee" }]}
      icon={<Wallet />}
      title="Collect fee"
      description="Pick a class to see who has dues, or search any student. Largest balances first."
    />
  );
  if (!year) return (<>{header}<EmptyState title="No academic year yet">Ask the Admin to set up the current academic year.</EmptyState></>);

  const supabase = await createClient();
  const classId = uuidRe.test(sp.class ?? "") ? sp.class! : "";
  const sectionId = uuidRe.test(sp.section ?? "") ? sp.section! : "";
  const show: CollectShow = sp.show === "all" || sp.show === "overdue" ? sp.show : "pending";
  // one database call for the whole page (fee access is checked by the database too)
  const page = await getCollectPage(supabase, year.id, todayIst());
  const { rows, sections, qr } = page;
  const settings = { requireUpiReference: page.requireUpiReference };

  // ---- one student: the collection screen
  if (uuidRe.test(sp.student ?? "")) {
    const q = new URLSearchParams();
    if (classId) q.set("class", classId);
    if (sectionId) q.set("section", sectionId);
    if (show !== "pending") q.set("show", show);
    const back = `/fees/collect${q.size ? `?${q}` : ""}`;
    let st = rows.find((r) => r.studentId === sp.student);
    let panel = st && { id: st.studentId, name: st.name, adm: st.adm, classLabel: st.classLabel, roll: st.roll, phone: st.phone, status: "active" };
    if (!panel) {
      // not enrolled this year / not active: fall back to a plain lookup
      const lookup = await getStudentLookup(supabase, year.id);
      const l = lookup.find((s) => s.id === sp.student);
      if (l) panel = { id: l.id, name: l.name, adm: l.adm, classLabel: l.classLabel, roll: null, phone: l.phones[0] ?? null, status: l.status };
    }
    st = undefined;
    if (!panel) return (<>{header}<EmptyState title="Student not found">This student isn&apos;t available. Go back to the class list.</EmptyState></>);
    return (
      <>
        {header}
        <CollectPanel student={panel} back={back} qr={qr} requireUpiRef={settings.requireUpiReference} />
      </>
    );
  }

  // ---- list
  let saved: { id: string; no: string; amount: number; name: string } | null = null;
  if (uuidRe.test(sp.saved ?? "")) {
    const { data: r } = await supabase.from("fee_receipts").select("id, receipt_no, total_paise, student_id, payer_name").eq("id", sp.saved!).maybeSingle();
    if (r) saved = { id: r.id, no: r.receipt_no, amount: Number(r.total_paise), name: rows.find((x) => x.studentId === r.student_id)?.name ?? r.payer_name ?? "" };
  }
  const savedDetail = saved ? await getReceiptDetail(supabase, saved.id) : null;
  const receiptSchool = savedDetail ? await getReceiptSchool() : null;
  const isAdmin = can(me, "fees.setup");
  const pickerStudents = isAdmin ? page.picker : [];
  const miscHeads = isAdmin ? page.miscHeads : [];
  const classes = [...new Map(sections.map((s) => [s.classId, { id: s.classId, name: s.className, order: s.classOrder }])).values()].sort((a, b) => a.order - b.order);
  return (
    <>
      {header}
      <CollectList
        rows={rows}
        classes={classes.map((c) => ({ id: c.id, name: c.name }))}
        sections={sections.map((s) => ({ id: s.id, label: s.label, classId: s.classId }))}
        classId={classId}
        sectionId={sectionId}
        show={show}
        saved={saved}
        savedReceipt={savedDetail && receiptSchool ? { data: savedDetail, school: receiptSchool } : null}
        isAdmin={isAdmin}
        pickerStudents={pickerStudents}
        miscHeads={miscHeads}
        qr={qr}
        requireUpiRef={settings.requireUpiReference}
      />
    </>
  );
}
