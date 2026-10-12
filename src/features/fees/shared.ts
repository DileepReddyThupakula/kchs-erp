import type { PaymentMode } from "@/types/database";

export const MODE_LABEL: Record<PaymentMode, string> = { cash: "Cash", upi: "UPI", cheque: "Cheque", bank_transfer: "Bank transfer" };
export const MODES = Object.entries(MODE_LABEL) as [PaymentMode, string][];

export const KIND_LABEL = { one_time: "One-time", monthly: "Monthly", custom: "Custom installments" } as const;

/** Today as YYYY-MM-DD in India time (matches the database's app.today_ist()). */
export function todayIst() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}
