import { redirect } from "next/navigation";

/** The old address: report cards are now a tab of Exams & marks. */
export default function OldReportCards() {
  redirect("/exams/report-cards");
}
