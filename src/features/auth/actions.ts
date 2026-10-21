"use server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loginKey, loginLabel, parseLoginId } from "@/lib/auth/login-id.mjs";
import { clientIp } from "@/lib/auth/client-ip";
import type { ActionState } from "@/lib/utils";
import { passwordSchema } from "@/features/staff/password";
import { MUST_CHANGE_KEY } from "@/lib/auth/force-change";
import { demoBlock } from "@/lib/demo";

const GENERIC = "Incorrect login ID or password.";
const schema = z.object({
  login: z.string().trim().min(1, "Enter your mobile number, username or email").max(120),
  password: z.string().min(1, "Enter your password").max(200),
});

export async function signIn(_: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { fieldErrors: parsed.error.flatten().fieldErrors };

  // The hidden login address is worked out by a fixed rule (no lookup), so a wrong ID and a wrong password look exactly the same.
  const id = parseLoginId(parsed.data.login);
  if (!id.ok) return { error: GENERIC };
  const key = loginKey(id, process.env.LOGIN_KEY_SECRET);
  const admin = createAdminClient();

  // 10 failures in 15 minutes lock this login ID for the rest of that window: the password is not even tried, and the message is the same.
  const { data: locked } = await admin.rpc("login_is_locked", { p_key: key });
  if (locked === true) return { error: GENERIC };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: id.authEmail, password: parsed.data.password });
  if (error) {
    // recorded so the Admin dashboard can warn about repeated failures on one login ID (best effort; never blocks the sign-in screen).
    // Written by the SERVER with the service key (nobody signed out can call it), with the caller's IP and browser, a masked label and the keyed hash.
    try {
      const h = await headers();
      const ip = clientIp(h);   // x-vercel-forwarded-for on Vercel; a client-supplied X-Forwarded-For is ignored there
      const { data: known } = await admin.from("staff_logins").select("id").eq("login_id", id.canonical).maybeSingle();
      await admin.rpc("log_failed_login", { p_key: key, p_label: loginLabel(id), p_known: !!known, p_ip: ip, p_user_agent: h.get("user-agent") ?? undefined });
    } catch { /* ignore */ }
    return { error: GENERIC };
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
  { const d = demoBlock(); if (d) return d; }   // public demo: turned off
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
