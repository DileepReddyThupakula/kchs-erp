import { redirect } from "next/navigation";
import { requirePage } from "@/features/students/page-guard";

/** Older address: all-class marking now lives on the Attendance page. */
export default async function AllClassesRedirect() {
  await requirePage("/attendance/all-classes");
  redirect("/attendance");
}
