import { redirect } from "next/navigation";
import { requirePage } from "@/features/students/page-guard";

/** Older address: teachers now use Diary and Notices directly. */
export default async function MyDiaryNoticesRedirect() {
  await requirePage("/my/diary-notices");
  redirect("/notices");
}
