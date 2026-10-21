/** The public demo site (portfolio / resume): dummy data only, no uploads, no account or settings changes. Set at BUILD time (NEXT_PUBLIC_DEMO_MODE=true). */
export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
export const DEMO_MESSAGE = "This is a demo with dummy data, so this is turned off here.";
/** Server actions call this first: `const d = demoBlock(); if (d) return d;` */
export function demoBlock(): { error: string } | null {
  return DEMO_MODE ? { error: DEMO_MESSAGE } : null;
}
export const DEMO_ACCOUNTS = [
  { login: "admin@demo.kchs.test", role: "Admin", note: "everything: students, fees, exams, reports, audit log" },
  { login: "teacher1@demo.kchs.test", role: "Teacher", note: "own classes: attendance, marks, diary" },
  { login: "fees@demo.kchs.test", role: "Fee office", note: "fee collection and fee reports" },
  { login: "desk@demo.kchs.test", role: "Front office", note: "student records, no fee access" },
] as const;
