/** Money is integer paise everywhere. These helpers only format / parse. */

/** 123456 -> "₹1,234.56"; 100000 -> "₹1,000"; fixed = always 2 decimals (receipts). */
export function formatPaise(p: number | string | null | undefined, opts: { fixed?: boolean } = {}) {
  const v = Math.round(Number(p ?? 0));
  const abs = Math.abs(v);
  const rupees = new Intl.NumberFormat("en-IN").format(Math.trunc(abs / 100));
  const paise = abs % 100;
  const dec = opts.fixed || paise ? "." + String(paise).padStart(2, "0") : "";
  return `${v < 0 ? "-" : ""}₹${rupees}${dec}`;
}

/** "1,234.5" / "₹ 1234" -> paise, or null when it isn't a valid amount. */
export function parseRupees(input: string | null | undefined): number | null {
  const s = String(input ?? "").replace(/[₹,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [i, f = ""] = s.split(".");
  return Number(i) * 100 + Number(f.padEnd(2, "0"));
}

/** paise -> text for an input box ("1234" or "1234.50"). */
export function rupeesInput(p: number | null | undefined) {
  const v = Number(p ?? 0);
  return v % 100 ? (v / 100).toFixed(2) : String(v / 100);
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100(n: number) {
  return n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;
}
function below1000(n: number) {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? below100(r) : ""].filter(Boolean).join(" ");
}
/** Indian numbering: Crore, Lakh, Thousand. */
function rupeeWords(n: number) {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1e3);
  const rest = n % 1e3;
  if (crore) parts.push(`${below1000(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

/** 123450 -> "Rupees One Thousand Two Hundred Thirty Four and Fifty Paise Only" */
export function amountInWords(paise: number) {
  const v = Math.round(Math.abs(paise));
  const r = Math.trunc(v / 100);
  const p = v % 100;
  return `Rupees ${rupeeWords(r)}${p ? ` and ${below100(p)} Paise` : ""} Only`;
}
