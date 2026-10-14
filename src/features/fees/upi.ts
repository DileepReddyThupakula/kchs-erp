/** UPI helpers (pure; run in the browser and in tests). */

/** upi://pay link for a static payee + amount. Amount in paise. */
export function buildUpiUri(opts: { upiId: string; payeeName: string; amountPaise?: number; note?: string }) {
  const q = new URLSearchParams();
  q.set("pa", opts.upiId.trim());
  q.set("pn", opts.payeeName.trim());
  if (opts.amountPaise && opts.amountPaise > 0) q.set("am", (opts.amountPaise / 100).toFixed(2));
  q.set("cu", "INR");
  if (opts.note?.trim()) q.set("tn", opts.note.trim().slice(0, 50));
  // URLSearchParams uses "+" for spaces; UPI apps expect %20
  return `upi://pay?${q.toString().replace(/\+/g, "%20")}`;
}

/** kchs.school@okbank -> kc***@okbank (same masking the audit log uses). */
export function maskUpi(upi: string | null | undefined) {
  if (!upi) return "";
  const [name, handle = ""] = upi.split("@");
  return `${name.slice(0, 2)}***@${handle}`;
}

export const UPI_ID_RE = /^[A-Za-z0-9._-]{2,255}@[A-Za-z0-9.-]{2,64}$/;
