"use client";
import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Eye, MoreHorizontal, Pencil, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * One row action. kind "view" / "edit" show as buttons on wide screens;
 * kind "menu" lives in the ⋯ menu. On phones everything is in the ⋯ menu.
 * Only pass actions the signed-in user may use (the server re-checks).
 */
export type RowAction = {
  id: string;
  label: string;
  kind: "view" | "edit" | "menu";
  icon?: LucideIcon;
  href?: string;
  onClick?: () => void | Promise<void>;
  tone?: "danger";
  /** Ask first (destructive / important actions). */
  confirm?: { title: string; message: React.ReactNode; confirmLabel?: string; danger?: boolean };
};

/** Elements inside a row whose clicks must NOT open the record. */
export const ROW_CLICK_IGNORE = "a,button,input,select,textarea,label,[role=menu],[role=menuitem],[data-row-click-ignore]";

const iconBtn =
  "inline-grid size-8 place-items-center rounded-lg text-navy-600 transition-colors hover:bg-navy-50 hover:text-navy-900 [&_svg]:size-4";

export function RowActionsCell({ actions, rowLabel, onRun }: { actions: RowAction[]; rowLabel: string; onRun: (a: RowAction) => void }) {
  const view = actions.find((a) => a.kind === "view");
  const edit = actions.find((a) => a.kind === "edit");
  const menu = actions.filter((a) => a.kind === "menu");
  const all = [...(view ? [view] : []), ...(edit ? [edit] : []), ...menu];
  if (!all.length) return null;

  const button = (a: RowAction, cls: string, children: React.ReactNode) =>
    a.href && !a.confirm ? (
      <Link href={a.href} className={cls} aria-label={`${a.label}: ${rowLabel}`} title={a.label}>
        {children}
      </Link>
    ) : (
      <button type="button" className={cls} aria-label={`${a.label}: ${rowLabel}`} title={a.label} onClick={() => onRun(a)}>
        {children}
      </button>
    );

  return (
    <div className="flex items-center justify-end gap-0.5" data-row-click-ignore>
      {view &&
        button(
          view,
          "hidden h-8 items-center gap-1.5 rounded-lg px-2 text-sm font-medium text-navy-700 transition-colors hover:bg-navy-50 hover:text-navy-900 sm:inline-flex",
          <>
            <Eye className="size-4" aria-hidden />
            <span className="hidden xl:inline">{view.label}</span>
          </>,
        )}
      {edit && button(edit, cn(iconBtn, "hidden sm:inline-grid"), <Pencil aria-hidden />)}
      <RowMenu
        rowLabel={rowLabel}
        // phones: every action; wide screens: only the "menu" ones
        items={all}
        desktopItems={menu}
        onRun={onRun}
      />
    </div>
  );
}

function RowMenu({ items, desktopItems, rowLabel, onRun }: { items: RowAction[]; desktopItems: RowAction[]; rowLabel: string; onRun: (a: RowAction) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number; up: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Position with `fixed` so the menu is never clipped by the scrolling table.
  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const up = window.innerHeight - r.bottom < 220;
    setPos({ top: up ? r.top - 4 : r.bottom + 4, right: window.innerWidth - r.right, up });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([hidden])") ?? [])].filter((el) => el.offsetParent !== null);
      const i = items.indexOf(document.activeElement as HTMLElement);
      if (e.key === "Escape") {
        close();
        btn.current?.focus();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        items[(i + 1) % items.length]?.focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        items[(i - 1 + items.length) % items.length]?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    // focus the first visible item
    requestAnimationFrame(() => {
      const first = [...(menuRef.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? [])].find((el) => el.offsetParent !== null);
      first?.focus();
    });
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const desktopIds = new Set(desktopItems.map((d) => d.id));
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`More actions: ${rowLabel}`}
        title="More actions"
        onClick={() => setOpen((o) => !o)}
        className={cn(iconBtn, !desktopItems.length && "sm:hidden", open && "bg-navy-50 text-navy-900")}
      >
        <MoreHorizontal aria-hidden />
      </button>
      {open &&
        pos &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            aria-label={`Actions: ${rowLabel}`}
            style={{ position: "fixed", right: pos.right, ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }) }}
            className="z-50 min-w-44 rounded-xl border border-border bg-surface p-1.5 shadow-[var(--shadow-lift)]"
          >
            {items.map((a) => {
              const Icon = a.icon ?? (a.kind === "view" ? Eye : a.kind === "edit" ? Pencil : undefined);
              const cls = cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm outline-none hover:bg-navy-50 focus:bg-navy-50",
                a.tone === "danger" ? "text-red-700 hover:bg-red-50 focus:bg-red-50" : "text-navy-900",
                !desktopIds.has(a.id) && "sm:hidden",
              );
              const body = (
                <>
                  {Icon && <Icon className="size-4 shrink-0" aria-hidden />}
                  {a.label}
                </>
              );
              return a.href && !a.confirm ? (
                <Link key={a.id} href={a.href} role="menuitem" className={cls} onClick={() => setOpen(false)}>
                  {body}
                </Link>
              ) : (
                <button
                  key={a.id}
                  type="button"
                  role="menuitem"
                  className={cls}
                  onClick={() => {
                    setOpen(false);
                    onRun(a);
                  }}
                >
                  {body}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}
