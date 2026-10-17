import { redirect } from "next/navigation";

/** The old address: marks entry is now a tab of Exams & marks. */
export default function OldMarks() {
  redirect("/exams/marks");
}
