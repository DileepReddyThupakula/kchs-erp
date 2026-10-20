"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { headers } from "next/headers";
import { isIP } from "node:net";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActionState } from "@/lib/utils";
import { passwordSchema } from "@/features/staff/password";
import { MUST_CHANGE_KEY } from "@/lib/auth/force-change";

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
    // The log is written by the SERVER with the service key (nobody signed out can call it), together with the caller's IP and browser.
    try {
      const h = await headers();
      const forwarded = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip")?.trim() || "";
      await createAdminClient().rpc("log_failed_login", { p_email: parsed.data.email, p_ip: isIP(forwarded) ? forwarded : undefined, p_user_agent: h.get("user-agent") ?? undefined });
    } catch { /* ignore */ }
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

const changeSchema = z.object({ password: passwordSchema, confirm: z.string() }).refine((v) => v.password === v.confirm, { path: ["confirm"], message: "The two passwords are not the same" });

/** First sign-in (or after an Admin reset): the person chooses their own password, then the "must change" mark is cleared. */
export async function changeOwnPassword(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = changeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { fieldErrors: { password: ["Choose a different password from the one you were given"] } };
    if (error.code === "weak_password") return { fieldErrors: { password: ["This password is too easy to guess. Choose another."] } };
    console.error("[auth-error]", error.code, error.message);
    return { error: "The password could not be changed. Please try again." };
  }
  await createAdminClient().auth.admin.updateUserById(auth.user.id, { app_metadata: { [MUST_CHANGE_KEY]: false } });
  await supabase.auth.refreshSession();
  await supabase.rpc("log_event", { p_action: "auth.password_changed" });
  redirect("/dashboard");
}
