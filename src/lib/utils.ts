export function cn(...classes: (string | false | null | undefined)[]) {
  const tokens = classes.filter(Boolean).join(" ").split(/\s+/).filter(Boolean);
  // a later explicit width (w-20, w-auto, w-56 ...) replaces an earlier w-full (the default width of form controls)
  const widthAt = tokens.findLastIndex((t) => /^w-(?!full$)/.test(t));
  return (widthAt < 0 ? tokens : tokens.filter((t, i) => !(t === "w-full" && i < widthAt))).join(" ");
}

/** Result shape returned by every server action used with useActionState. */
export type ActionState = {
  ok?: boolean;
  message?: string;
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
};

export const initialActionState: ActionState = {};

/** What Postgres, PostgREST and Supabase say about themselves (table, column and constraint names, JWT, schema cache...). Never shown to staff. */
const SYSTEM_TEXT = /violates (check|foreign key|unique|not-null|exclusion) constraint|duplicate key value|null value in column|invalid input syntax|invalid input value|out of range|value too long|relation "|column "|function .* does not exist|syntax error|permission denied for|row-level security|new row for relation|JWT|PGRST|schema cache|could not (serialize|connect|obtain|open|read)|deadlock|statement timeout|connection (refused|terminated|to )|FATAL|ERROR:|at character|\bpg_|\bpublic\.|\bapp\.|\bauth\.|\bstorage\./i;

const GENERIC = "Something went wrong. Nothing was changed. Please try again, and tell the Admin if it keeps happening.";

/**
 * A database message that is safe to show to staff. The messages our own database functions raise are written for staff and are kept.
 * Anything else (a Postgres, PostgREST or storage message) is written to the SERVER log and replaced by a short generic text.
 */
export function safeDbMessage(message: string | undefined | null, code?: string | null): string {
  if (!message) return GENERIC;
  if (code === "42501" || /\bnot allowed\b|permission denied/i.test(message)) return "You don't have permission to do this.";
  if (!SYSTEM_TEXT.test(message) && (!code || ["P0001", "P0002", "23514", "23505", "23503", "23P01"].includes(code))) return message;
  console.error("[db-error]", code ?? "-", message.slice(0, 500));
  switch (code) {
    case "23505": return "This already exists (duplicate name or code).";
    case "23503": return "This is still in use elsewhere, so it can't be removed.";
    case "23502": return "A required value is missing.";
    case "23514": return "That value is not allowed. Please check what you entered.";
    case "22P02": case "22007": case "22008": case "22003": case "22001": return "A value is not in the right format.";
    default: return GENERIC;
  }
}

/** Turn a Postgres/PostgREST error into a message staff can understand (see safeDbMessage). */
export function friendlyDbError(err: { code?: string; message: string } | null): string {
  if (!err) return "Something went wrong.";
  return safeDbMessage(err.message, err.code);
}

export function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
