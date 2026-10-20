"use server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requirePage } from "@/features/students/page-guard";
import type { Preview } from "./shared";
import { safeDbMessage } from "@/lib/utils";

export type PreviewResult = { ok: true; preview: Preview } | { ok: false; error: string };
export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

/** A Postgres error as a short sentence for the Admin. */
function plain(message: string | undefined) {
  if (!message) return "Something went wrong. Nothing was changed.";
  return safeDbMessage(message.replace(/^.*?(Type the new year|Tick |The checklist|Cannot undo|Unknown)/, "$1"));
}

/** What would happen with these choices. Changes nothing. Admin only (checked here and again in the database). */
export async function previewRollover(fromId: string, toId: string, plan: Record<string, unknown>): Promise<PreviewResult> {
  await requirePage("/students/promotion");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("rollover_preview", { p_from: fromId, p_to: toId, p_plan: JSON.parse(JSON.stringify(plan)) });
  if (error || !data) return { ok: false, error: plain(error?.message) };
  return { ok: true, preview: data as unknown as Preview };
}

export async function confirmRollover(fromId: string, toId: string, plan: Record<string, unknown>, checked: boolean, typedName: string): Promise<ActionResult> {
  await requirePage("/students/promotion");
  const supabase = await createClient();
  const { error } = await supabase.rpc("rollover_confirm", { p_from: fromId, p_to: toId, p_plan: JSON.parse(JSON.stringify(plan)), p_checked: checked, p_typed_name: typedName });
  if (error) return { ok: false, error: plain(error.message) };
  for (const p of ["/students/promotion", "/dashboard", "/students"]) revalidatePath(p);
  return { ok: true, message: "The new year has started." };
}

export async function undoRollover(runId: string): Promise<ActionResult> {
  await requirePage("/students/promotion");
  const supabase = await createClient();
  const { error } = await supabase.rpc("rollover_undo", { p_run: runId });
  if (error) return { ok: false, error: plain(error.message) };
  for (const p of ["/students/promotion", "/dashboard", "/students"]) revalidatePath(p);
  return { ok: true, message: "The rollover was undone. Everything is back as it was." };
}
