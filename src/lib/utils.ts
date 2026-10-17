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

/** Turn a Postgres/PostgREST error into a message staff can understand. */
export function friendlyDbError(err: { code?: string; message: string } | null): string {
  if (!err) return "Something went wrong.";
  switch (err.code) {
    case "23505":
      return "This already exists (duplicate name or code).";
    case "23503":
      return "This is still in use elsewhere, so it can't be removed.";
    case "42501":
      return "You don't have permission to do this.";
    case "23514":
    case "P0001":
      return err.message;
    default:
      return err.message;
  }
}

export function formatDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d + (d.length === 10 ? "T00:00:00" : "")).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
