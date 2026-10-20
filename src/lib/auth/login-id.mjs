// Login IDs: staff sign in with an email, a 10-digit Indian mobile number, or a username. Supabase Auth wants an email address,
// so a mobile number or username is turned (by a fixed rule, no lookup) into a hidden address on a reserved domain that can never
// receive mail. The login is created already confirmed, and the Admin sets and resets every password: no email, no SMS.
import crypto from "node:crypto";

export const HIDDEN_DOMAIN = "login.kchs.invalid";            // ".invalid" is reserved (RFC 2606): it never resolves and can never receive mail
const EMAIL = /^[a-z0-9._%+'-]{1,64}@[a-z0-9-]+(\.[a-z0-9-]+)+$/;
const USERNAME = /^[a-z][a-z0-9._-]{2,29}$/;                   // starts with a letter, so it can never look like a number

/** { ok: true, kind, canonical, authEmail } or { ok: false, error }. Pure: no lookup, nothing about who exists. */
export function parseLoginId(raw) {
  const text = String(raw ?? "").trim().toLowerCase();
  if (!text) return { ok: false, error: "Enter the login ID." };
  if (text.includes("@")) {
    if (!EMAIL.test(text) || text.length > 120) return { ok: false, error: "That email address is not valid." };
    if (text.endsWith("@" + HIDDEN_DOMAIN)) return { ok: false, error: "Enter a mobile number, a username or a real email." };
    return { ok: true, kind: "email", canonical: text, authEmail: text };
  }
  const digits = text.replace(/[\s().-]/g, "");
  if (/^\+?[0-9]+$/.test(digits)) {
    let d = digits.replace(/^\+/, "");
    if (d.length === 12 && d.startsWith("91")) d = d.slice(2);
    else if (d.length === 11 && d.startsWith("0")) d = d.slice(1);
    if (!/^[6-9][0-9]{9}$/.test(d)) return { ok: false, error: "A mobile number has 10 digits and starts with 6, 7, 8 or 9." };
    return { ok: true, kind: "mobile", canonical: d, authEmail: `m${d}@${HIDDEN_DOMAIN}` };
  }
  if (!USERNAME.test(text)) return { ok: false, error: "A username has 3 to 30 letters, digits, dots, dashes or underscores and starts with a letter." };
  return { ok: true, kind: "username", canonical: text, authEmail: `u-${text}@${HIDDEN_DOMAIN}` };
}

/** What may be shown or logged: a mobile number keeps only its last four digits. */
export function loginLabel(parsed) {
  return parsed.kind === "mobile" ? `******${parsed.canonical.slice(-4)}` : parsed.canonical;
}
/** Same for a stored login ID string. */
export function maskLoginId(stored) {
  const p = parseLoginId(stored);
  return p.ok ? loginLabel(p) : "[hidden]";
}

/** The stable key behind throttles and alerts: a keyed hash (HMAC) so a leaked log cannot be turned back into mobile numbers. */
export function loginKey(parsed, secret) {
  if (!secret || String(secret).length < 24) throw new Error("LOGIN_KEY_SECRET is missing or too short (at least 24 characters).");
  return crypto.createHmac("sha256", secret).update(`${parsed.kind}:${parsed.canonical}`).digest("hex").slice(0, 32);
}

/** The hidden address means nothing to a person: never show it. */
export const isHiddenAddress = (email) => typeof email === "string" && email.toLowerCase().endsWith("@" + HIDDEN_DOMAIN);
