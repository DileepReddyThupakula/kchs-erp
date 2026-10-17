import type { CircularData, CircularSchool } from "@/components/notices/circular-sheet";
import { fmtLong } from "./shared";

type N = { circular_no: string | null; publish_date: string; title: string; body: string; title_te: string | null; body_te: string | null; status: string };

/** The circular as it is shown, printed and drawn. No student names, no stored signature. */
export function circularData(n: N, school: CircularSchool, toLine: string): CircularData {
  return { school, circularNo: n.circular_no, dateLong: fmtLong(n.publish_date), toLine, title: n.title, body: n.body, titleTe: n.title_te, bodyTe: n.body_te, draft: n.status === "draft" };
}
