import { getBranding } from "@/lib/branding";
import { LoginScene } from "@/components/brand/login-scene";
import { TiltLogo } from "@/components/brand/tilt-logo";
import { LoginForm } from "./login-form";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  const brand = await getBranding();
  const motto = brand.motto;

  return (
    <main className="login-scene relative flex min-h-dvh items-center justify-center overflow-hidden px-4 py-10 text-cream-100">
      <LoginScene />
      <div className="relative z-10 flex w-full max-w-5xl flex-col items-center gap-8 lg:flex-row lg:justify-between lg:gap-16">
        <div className="flex flex-col items-center gap-6 lg:w-1/2">
          <TiltLogo src={brand.logoUrl} alt={`${brand.name} logo`} />
          <div className="hidden text-center lg:block">
            <p className="font-display text-2xl font-semibold tracking-wide text-balance text-cream-50 xl:text-3xl">{brand.name}</p>
            {motto && <p className="mt-2 text-sm uppercase tracking-[0.35em] text-gold-300">{motto}</p>}
          </div>
        </div>

        <div className="glass w-full max-w-md animate-rise rounded-2xl p-6 sm:p-8 lg:w-[26rem]">
          <div className="mb-6 text-center lg:text-left">
            <h1 className="font-display text-xl font-semibold tracking-wide text-cream-50 sm:text-2xl lg:hidden">{brand.name}</h1>
            {motto && <p className="mt-1 text-xs uppercase tracking-[0.3em] text-gold-300 lg:hidden">{motto}</p>}
            <p className="mt-3 text-lg font-semibold text-white lg:mt-0">Staff sign in</p>
            <p className="text-sm text-navy-200">Use the login ID (mobile number, username or email) and the password given by your school Admin.</p>
          </div>
          {error === "no-access" && (
            <p role="alert" className="mb-4 rounded-lg border border-red-300/40 bg-red-600/20 px-3 py-2 text-sm text-red-50">
              Your account has no active staff role. Contact the Admin.
            </p>
          )}
          <LoginForm />
        </div>
      </div>
    </main>
  );
}
