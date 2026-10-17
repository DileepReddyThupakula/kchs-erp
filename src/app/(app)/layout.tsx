import { LogOut } from "lucide-react";
import { requireStaff } from "@/lib/auth/session";
import { getBranding } from "@/lib/branding";
import { Sidebar } from "@/components/layout/sidebar";
import { RoleBadge } from "@/components/ui/card";
import { signOut } from "@/features/auth/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [me, brand] = await Promise.all([requireStaff(), getBranding()]);

  return (
    <div className="lg:flex">
      <Sidebar perms={{ role: me.role, duties: me.duties }} shortName={brand.shortName} logoUrl={brand.logoUrl} />
      <div className="min-w-0 flex-1">
        <header className="flex items-center justify-end gap-3 border-b border-border bg-surface/80 px-4 py-2.5 backdrop-blur lg:sticky lg:top-0 lg:z-20 lg:px-8">
          <div className="flex min-w-0 items-center gap-2 text-sm">
            <span className="truncate font-medium text-navy-900">{me.fullName}</span>
            <RoleBadge role={me.role} />
          </div>
          <form action={signOut}>
            <button className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-navy-800 transition-colors hover:border-navy-200 hover:bg-navy-50">
              <LogOut className="size-4" aria-hidden />
              <span className="max-sm:sr-only">Sign out</span>
            </button>
          </form>
        </header>
        <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
