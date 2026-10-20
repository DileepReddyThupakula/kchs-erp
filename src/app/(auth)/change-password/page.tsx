import { redirect } from "next/navigation";
import { getBranding } from "@/lib/branding";
import { LoginScene } from "@/components/brand/login-scene";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/features/auth/actions";
import { ChangePasswordForm } from "./change-form";

export const metadata = { title: "Choose your password" };

export default async function ChangePasswordPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  const brand = await getBranding();
  return (
    <main className="login-scene relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10 text-cream-100">
      <LoginScene />
      <div className="glass relative z-10 w-full max-w-md animate-rise rounded-2xl p-6 sm:p-8">
        <p className="text-xs uppercase tracking-[0.3em] text-gold-300">{brand.name}</p>
        <h1 className="mt-2 text-lg font-semibold text-white">Choose your own password</h1>
        <p className="mb-4 text-sm text-navy-200">The password you were given is only for the first sign-in. Choose one that only you know. Use at least 10 characters.</p>
        <ChangePasswordForm />
        <form action={signOut} className="mt-4 text-center">
          <button type="submit" className="text-sm text-navy-200 underline">Sign out</button>
        </form>
      </div>
    </main>
  );
}
