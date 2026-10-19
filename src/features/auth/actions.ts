"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { ActionState } from "@/lib/utils";

const schema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  password: z.string().min(1, "Enter your password"),
});

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    // recorded so the Admin dashboard can warn about repeated failures on one account (best effort; never blocks the sign-in screen)
    try { await supabase.rpc("log_failed_login", { p_email: parsed.data.email }); } catch { /* ignore */ }
    return { error: "Incorrect email or password." };
  }

  const { data: role } = await supabase.rpc("my_role");
  if (!role) {
    await supabase.auth.signOut();
    return { error: "Your account has no active staff role. Contact the Admin." };
  }
  await supabase.rpc("log_event", { p_action: "auth.login" });
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
