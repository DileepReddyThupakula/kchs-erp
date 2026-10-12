import "server-only";
import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth/session";
import { canOpenPage, findPage } from "@/lib/site-map";

/** Permission check for a site-map page, BEFORE any data loads. */
export async function requirePage(path: string) {
  const me = await requireStaff();
  const page = findPage(path);
  if (!page || !canOpenPage(page, me)) redirect("/not-allowed");
  return me;
}
