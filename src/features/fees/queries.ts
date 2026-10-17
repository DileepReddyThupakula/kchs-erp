import "server-only";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetch-all";
import { getSectionOptions } from "@/features/students/queries";
import type { FeeHead, PaymentMode } from "@/types/database";

type Supa = Awaited<ReturnType<typeof createClient>>;

export type StudentLookup = {
  id: string;
  name: string;
  adm: string;
  status: string;
  classId: string | null;
  sectionId: string | null;
  className: string | null;
  section: string | null;
  classLabel: string;
  phones: string[];
};

/** Light list of students for pickers and the collect-fee search (name, adm, phone). */
export async function getStudentLookup(supabase: Supa, yearId: string): Promise<StudentLookup[]> {
  const [students, enrolments, sections, links, guardians] = await Promise.all([
    fetchAll((f, t) => supabase.from("students").select("id, admission_no, full_name, status").order("full_name").range(f, t)),
    fetchAll((f, t) => supabase.from("student_enrollments").select("student_id, section_id").eq("academic_year_id", yearId).range(f, t)),
    getSectionOptions(supabase, yearId),
    fetchAll((f, t) => supabase.from("student_guardians").select("student_id, guardian_id").range(f, t)),
    fetchAll((f, t) => supabase.from("guardians").select("id, phone").not("phone", "is", null).range(f, t)),
  ]);
  const sec = new Map(sections.map((s) => [s.id, s]));
  const enrol = new Map(enrolments.map((e) => [e.student_id, e.section_id]));
  const phone = new Map(guardians.map((g) => [g.id, g.phone as string]));
  const phones = new Map<string, string[]>();
  for (const l of links) {
    const p = phone.get(l.guardian_id);
    if (p) phones.set(l.student_id, [...(phones.get(l.student_id) ?? []), p]);
  }
  return students.map((s) => {
    const sc = sec.get(enrol.get(s.id) ?? "");
    return {
      id: s.id,
      name: s.full_name,
      adm: s.admission_no,
      status: s.status,
      classId: sc?.classId ?? null,
      sectionId: sc?.id ?? null,
      className: sc?.className ?? null,
      section: sc?.section ?? null,
      classLabel: sc ? `${sc.className} – ${sc.section}` : "Not enrolled",
      phones: [...new Set(phones.get(s.id) ?? [])],
    };
  });
}

export async function getFeeHeads(supabase: Supa) {
  const { data } = await supabase.from("fee_heads").select("*").order("sort_order").order("name");
  const { data: camps } = await supabase.from("fee_campaigns").select("fee_head_id");
  const special = new Set((camps ?? []).map((c) => c.fee_head_id));
  const heads = (data ?? []) as FeeHead[];
  return { all: heads, special, regular: heads.filter((h) => !special.has(h.id)) };
}

export type DueRow = {
  id: string;
  studentId: string;
  yearId: string;
  headId: string;
  headName: string;
  isSpecial: boolean;
  label: string;
  dueDate: string;
  amount: number;
  concession: number;
  paid: number;
  balance: number;
};

export function toDueRow(
  d: { id: string; student_id: string; academic_year_id: string; fee_head_id: string; label: string; due_date: string; amount_paise: number; concession_paise: number; paid_paise: number },
  heads: Map<string, FeeHead>,
  special: Set<string>,
): DueRow {
  const net = Number(d.amount_paise) - Number(d.concession_paise);
  return {
    id: d.id,
    studentId: d.student_id,
    yearId: d.academic_year_id,
    headId: d.fee_head_id,
    headName: heads.get(d.fee_head_id)?.name ?? "—",
    isSpecial: special.has(d.fee_head_id),
    label: d.label,
    dueDate: d.due_date,
    amount: Number(d.amount_paise),
    concession: Number(d.concession_paise),
    paid: Number(d.paid_paise),
    balance: net - Number(d.paid_paise),
  };
}

export type ReceiptRow = {
  id: string;
  receiptNo: string;
  date: string;
  studentId: string | null;
  studentName: string;
  admissionNo: string | null;
  classId: string | null;
  className: string | null;
  total: number;
  mode: PaymentMode;
  reference: string | null;
  collectedBy: string;
  collectedById: string;
  status: "valid" | "cancelled";
  kind: "dues" | "misc";
  cancelReason: string | null;
  notes: string | null;
  heads: { headId: string; headName: string; amount: number; isSpecial: boolean }[];
  createdAt: string;
};

/** Receipts in a date range (with their fee heads) for lists and reports. */
export async function getReceipts(
  supabase: Supa,
  opts: { from?: string; to?: string; studentId?: string; lookup?: Map<string, StudentLookup> },
): Promise<ReceiptRow[]> {
  const { all: heads, special } = await getFeeHeads(supabase);
  const headById = new Map(heads.map((h) => [h.id, h]));
  const rows = await fetchAll((f, t) => {
    let q = supabase
      .from("fee_receipts")
      .select("*, fee_receipt_items(fee_head_id, amount_paise)")
      .order("receipt_date", { ascending: false })
      .order("seq", { ascending: false })
      .range(f, t);
    if (opts.from) q = q.gte("receipt_date", opts.from);
    if (opts.to) q = q.lte("receipt_date", opts.to);
    if (opts.studentId) q = q.eq("student_id", opts.studentId);
    return q;
  });
  const { data: dir } = await supabase.rpc("staff_directory");
  const staffName = new Map((dir ?? []).map((s) => [s.id, s.full_name]));
  let lookup = opts.lookup;
  if (!lookup) lookup = new Map();
  return rows.map((r) => {
    const st = r.student_id ? lookup!.get(r.student_id) : undefined;
    const items = (r as unknown as { fee_receipt_items: { fee_head_id: string; amount_paise: number }[] }).fee_receipt_items ?? [];
    const byHead = new Map<string, number>();
    for (const it of items) byHead.set(it.fee_head_id, (byHead.get(it.fee_head_id) ?? 0) + Number(it.amount_paise));
    return {
      id: r.id,
      receiptNo: r.receipt_no,
      date: r.receipt_date,
      studentId: r.student_id,
      studentName: st?.name ?? r.payer_name ?? "—",
      admissionNo: st?.adm ?? null,
      classId: st?.classId ?? null,
      className: st?.className ?? null,
      total: Number(r.total_paise),
      mode: r.payment_mode,
      reference: r.reference_no,
      collectedBy: staffName.get(r.collected_by) ?? "—",
      collectedById: r.collected_by,
      status: r.status,
      kind: r.kind,
      cancelReason: r.cancel_reason,
      notes: r.notes,
      heads: [...byHead.entries()].map(([headId, amount]) => ({ headId, headName: headById.get(headId)?.name ?? "—", amount, isSpecial: special.has(headId) })),
      createdAt: r.created_at,
    };
  });
}

export type ReceiptDetail = {
  receipt: ReceiptRow & { payerName: string | null; cancelledAt: string | null };
  items: { description: string; amount: number; concession: number; isSpecial: boolean }[];
  student: { name: string; adm: string; className: string | null; section: string | null; roll: number | null; guardian: string | null } | null;
  /** Academic year of the receipt date, and what the student still owed right after this payment. */
  academicYear: string | null;
  balanceAfter: number | null;
};

/** One receipt with its line items and the student's class (RLS decides who may see it). */
export async function getReceiptDetail(supabase: Supa, id: string): Promise<ReceiptDetail | null> {
  const { data: r } = await supabase.from("fee_receipts").select("*").eq("id", id).maybeSingle();
  if (!r) return null;
  const { all, special } = await getFeeHeads(supabase);
  const headName = new Map(all.map((h) => [h.id, h.name]));
  const { data: items } = await supabase.from("fee_receipt_items").select("fee_head_id, amount_paise, due_id").eq("receipt_id", id);
  const dueIds = (items ?? []).map((i) => i.due_id).filter((x): x is string => !!x);
  const { data: dues } = dueIds.length ? await supabase.from("student_fee_dues").select("id, label, concession_paise").in("id", dueIds) : { data: [] };
  const dueLabel = new Map((dues ?? []).map((d) => [d.id, d.label]));
  const dueConcession = new Map((dues ?? []).map((d) => [d.id, Number(d.concession_paise)]));
  const { data: years } = await supabase.from("academic_years").select("id, name, start_date, end_date");
  const year = (years ?? []).find((yy) => yy.start_date <= r.receipt_date && r.receipt_date <= yy.end_date) ?? null;
  const { data: dir } = await supabase.rpc("staff_directory");
  const staff = new Map((dir ?? []).map((s) => [s.id, s.full_name]));

  let student: ReceiptDetail["student"] = null;
  if (r.student_id) {
    const { data: st } = await supabase.from("students").select("full_name, admission_no").eq("id", r.student_id).maybeSingle();
    const { data: enr } = await supabase.from("student_enrollments").select("academic_year_id, section_id, roll_no").eq("student_id", r.student_id);
    const e = (enr ?? []).find((x) => x.academic_year_id === year?.id) ?? (enr ?? [])[0];
    let className: string | null = null;
    let section: string | null = null;
    if (e) {
      const { data: sec } = await supabase.from("sections").select("name, class_id").eq("id", e.section_id).maybeSingle();
      if (sec) {
        const { data: cls } = await supabase.from("classes").select("name").eq("id", sec.class_id).maybeSingle();
        className = cls?.name ?? null;
        section = sec.name;
      }
    }
    let guardian: string | null = null;
    const { data: links } = await supabase.from("student_guardians").select("guardian_id, is_primary").eq("student_id", r.student_id);
    const link = (links ?? []).find((l) => l.is_primary) ?? (links ?? [])[0];
    if (link) {
      const { data: g } = await supabase.from("guardians").select("full_name").eq("id", link.guardian_id).maybeSingle();
      guardian = g?.full_name ?? null;
    }
    if (st) student = { name: st.full_name, adm: st.admission_no, className, section, roll: e?.roll_no ?? null, guardian };
  }

  const lines = (items ?? []).map((i) => ({
    description: `${headName.get(i.fee_head_id) ?? "Fee"}${i.due_id && dueLabel.get(i.due_id) ? `, ${dueLabel.get(i.due_id)}` : ""}`,
    amount: Number(i.amount_paise),
    concession: i.due_id ? (dueConcession.get(i.due_id) ?? 0) : 0,
    isSpecial: special.has(i.fee_head_id),
  }));
  const row: ReceiptRow = {
    id: r.id,
    receiptNo: r.receipt_no,
    date: r.receipt_date,
    studentId: r.student_id,
    studentName: student?.name ?? r.payer_name ?? "—",
    admissionNo: student?.adm ?? null,
    classId: null,
    className: student?.className ?? null,
    total: Number(r.total_paise),
    mode: r.payment_mode,
    reference: r.reference_no,
    collectedBy: staff.get(r.collected_by) ?? "—",
    collectedById: r.collected_by,
    status: r.status,
    kind: r.kind,
    cancelReason: r.cancel_reason,
    notes: r.notes,
    heads: [],
    createdAt: r.created_at,
  };

  // Still owed right after this payment = owed now + what later (still valid) receipts took off.
  let balanceAfter: number | null = null;
  if (r.student_id && year && r.kind !== "misc") {
    const { data: open } = await supabase
      .from("student_fee_dues")
      .select("amount_paise, concession_paise, paid_paise")
      .eq("student_id", r.student_id)
      .eq("academic_year_id", year.id)
      .is("voided_at", null);
    let owed = (open ?? []).reduce((a, x) => a + Number(x.amount_paise) - Number(x.concession_paise) - Number(x.paid_paise), 0);
    if (r.status === "valid") {
      const { data: later } = await supabase
        .from("fee_receipts")
        .select("id")
        .eq("student_id", r.student_id)
        .eq("status", "valid")
        .gt("created_at", r.created_at);
      const ids = (later ?? []).map((x) => x.id);
      if (ids.length) {
        const { data: li } = await supabase.from("fee_receipt_items").select("amount_paise, due_id").in("receipt_id", ids);
        owed += (li ?? []).filter((x) => x.due_id).reduce((a, x) => a + Number(x.amount_paise), 0);
      }
    }
    balanceAfter = Math.max(0, owed);
  }
  return { receipt: { ...row, payerName: r.payer_name, cancelledAt: r.cancelled_at }, items: lines, student, academicYear: year?.name ?? null, balanceAfter };
}

// ------------------------------------------------------------------ Collect fee list + payment settings
import type { CollectRow } from "./collect-list";

/**
 * Everything the Collect fee page needs, from ONE database call (public.collect_page, fee access only): every active enrolled
 * student with outstanding / overdue / last payment, the sections, the UPI settings and, for the Admin, the misc-receipt picker.
 * Only the QR image link is signed separately (a storage call), and only when a QR image has been uploaded.
 */
export async function getCollectPage(supabase: Supa, yearId: string, today: string) {
  const { data, error } = await supabase.rpc("collect_page", { p_year: yearId, p_today: today });
  if (error) throw error;
  const d = data as unknown as {
    rows: CollectRow[];
    sections: { id: string; classId: string; className: string; classOrder: number; name: string; label: string }[];
    settings: { upi_id: string | null; payee_name: string | null; qr_path: string | null; require_upi_reference: boolean } | null;
    picker: { id: string; name: string; adm: string; classLabel: string; phones: string[] }[];
    miscHeads: { id: string; name: string }[];
  };
  let qrUrl: string | null = null;
  if (d.settings?.qr_path) {
    const { data: signed } = await supabase.storage.from("payment-qr").createSignedUrl(d.settings.qr_path, 3600);
    qrUrl = signed?.signedUrl ?? null;
  }
  return {
    rows: d.rows.map((r) => ({ ...r, totalDue: Number(r.totalDue), overdue: Number(r.overdue) })),
    sections: d.sections,
    qr: { upiId: d.settings?.upi_id ?? null, payeeName: d.settings?.payee_name ?? null, qrUrl },
    requireUpiReference: d.settings?.require_upi_reference ?? false,
    picker: d.picker,
    miscHeads: d.miscHeads,
  };
}

export type FeeSettingsView = {
  upiId: string | null;
  payeeName: string | null;
  qrUrl: string | null;
  hasQrImage: boolean;
  requireUpiReference: boolean;
  changedBy: string | null;
  changedAt: string | null;
};

/** School UPI / QR settings. QR image comes back as a 1-hour signed link (private bucket). */
export async function getFeeSettings(supabase: Supa): Promise<FeeSettingsView> {
  const { data } = await supabase.from("fee_settings").select("*").eq("id", 1).maybeSingle();
  let qrUrl: string | null = null;
  if (data?.qr_path) {
    const { data: signed } = await supabase.storage.from("payment-qr").createSignedUrl(data.qr_path, 3600);
    qrUrl = signed?.signedUrl ?? null;
  }
  return {
    upiId: data?.upi_id ?? null,
    payeeName: data?.payee_name ?? null,
    qrUrl,
    hasQrImage: !!data?.qr_path,
    requireUpiReference: data?.require_upi_reference ?? false,
    changedBy: data?.changed_by_name ?? null,
    changedAt: data?.updated_by ? (data.updated_at ?? null) : null,
  };
}
