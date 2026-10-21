"use client";
import { DEMO_ACCOUNTS, DEMO_MODE } from "@/lib/demo";

/** On the public demo only: the demo logins, one click fills the sign-in form. The password is public on purpose (dummy data only). */
export function DemoAccounts() {
  if (!DEMO_MODE) return null;
  const password = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "";
  const fill = (login: string) => {
    const set = (id: string, v: string) => {
      const el = document.getElementById(id) as HTMLInputElement | null;
      if (!el) return;
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    };
    set("login", login);
    set("password", password);
  };
  return (
    <div className="mt-5 rounded-xl border border-gold-300/40 bg-white/10 p-4 text-sm text-cream-100" aria-label="Demo accounts">
      <p className="font-semibold text-white">Try the demo</p>
      <p className="mt-1 text-xs text-navy-200">Sample School with fictional students and staff. Pick a role, then press Sign in.</p>
      <ul className="mt-3 space-y-2">
        {DEMO_ACCOUNTS.map((a) => (
          <li key={a.login}>
            <button type="button" onClick={() => fill(a.login)} className="w-full rounded-lg border border-white/20 px-3 py-2 text-left hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold-400">
              <span className="font-medium text-white">{a.role}</span> <span className="text-xs text-navy-200">· {a.note}</span>
              <span className="block text-xs text-cream-100">{a.login}</span>
            </button>
          </li>
        ))}
      </ul>
      {password && <p className="mt-3 text-xs text-navy-200">Password for all: <code className="rounded bg-black/30 px-1 text-cream-50">{password}</code></p>}
    </div>
  );
}
