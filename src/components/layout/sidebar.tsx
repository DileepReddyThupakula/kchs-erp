"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { can, type Permissions } from "@/lib/auth/permissions";
import { LogoBadge } from "@/components/brand/logo-badge";
import { NAV } from "./nav";

export function Sidebar({ perms, shortName, logoUrl }: { perms: Permissions; shortName: string; logoUrl: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile drawer on navigation and with Escape.
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const groups = NAV.map((g) => ({
    ...g,
    items: g.items.filter((i) => (i.teacherOnly ? perms.role === "teacher" : !i.cap || can(perms, i.cap))),
  })).filter(
    (g) => g.items.length,
  );

  const brand = (
    <Link href="/dashboard" className="flex items-center gap-3">
      <LogoBadge src={logoUrl} alt="" sizes="44px" className="size-11" />
      <span className="font-display text-lg font-semibold leading-tight tracking-wide text-cream-50">{shortName}</span>
    </Link>
  );

  return (
    <>
      {/* Mobile top strip */}
      <div className="sticky top-0 z-30 flex items-center justify-between bg-navy-900 px-4 py-2.5 shadow-md lg:hidden">
        {brand}
        <button
          className="grid size-10 place-items-center rounded-lg text-cream-100 hover:bg-white/10"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          aria-controls="app-sidebar"
        >
          <Menu className="size-5" />
        </button>
      </div>

      {/* Backdrop (mobile) */}
      <div
        className={cn("fixed inset-0 z-40 bg-navy-950/50 transition-opacity lg:hidden", open ? "opacity-100" : "pointer-events-none opacity-0")}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      <nav
        id="app-sidebar"
        aria-label="Main"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-navy-900 text-navy-100 shadow-2xl transition-transform duration-200 ease-out",
          "lg:sticky lg:top-0 lg:h-dvh lg:w-64 lg:translate-x-0 lg:shadow-none",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-4">
          {brand}
          <button className="grid size-9 place-items-center rounded-lg hover:bg-white/10 lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu">
            <X className="size-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-3 py-4">
          {groups.map((g, gi) => (
            <div key={gi} className="mb-5">
              {g.label && <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-navy-300">{g.label}</p>}
              <ul className="space-y-0.5">
                {g.items.map(({ href, label, icon: Icon }) => {
                  const active = pathname === href || pathname.startsWith(href + "/");
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                          "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                          active ? "bg-white/10 font-semibold text-gold-400" : "text-navy-100 hover:bg-white/5 hover:text-white",
                        )}
                      >
                        {active && <span className="absolute inset-y-1.5 left-0 w-1 rounded-r-full bg-gold-500" aria-hidden />}
                        <Icon className={cn("size-[18px] shrink-0", active ? "text-gold-400" : "text-navy-300 group-hover:text-cream-100")} aria-hidden />
                        {label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </nav>
    </>
  );
}
