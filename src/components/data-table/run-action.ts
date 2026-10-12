"use client";
import { toast } from "sonner";
import type { ActionState } from "@/lib/utils";

type FormAction = (state: ActionState, fd: FormData) => Promise<ActionState>;

/** Run a form-style server action from a button/menu, toast the result, refresh on success. */
export async function runFormAction(action: FormAction, fields: Record<string, string>, refresh: () => void) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  const res = await action({}, fd);
  if (res.error) toast.error(res.error);
  else {
    toast.success(res.message ?? "Done.");
    refresh();
  }
}

/** Same for void server actions (they throw on failure). */
export async function runVoidAction(action: (fd: FormData) => Promise<void>, fields: Record<string, string>, done: string, refresh: () => void) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  try {
    await action(fd);
    toast.success(done);
    refresh();
  } catch (e) {
    toast.error(e instanceof Error && e.message ? e.message : "That didn't work. Please try again.");
  }
}
