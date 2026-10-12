import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ROLE_LABELS, type AppRole } from "@/lib/auth/permissions";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius-card)] border border-border bg-surface p-4 shadow-[var(--shadow-soft)] sm:p-5", className)} {...props} />;
}

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-2">
      <ol className="flex flex-wrap items-center gap-1 text-xs text-muted">
        {items.map((c, i) => (
          <li key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3.5 text-navy-300" aria-hidden />}
            {c.href ? (
              <Link href={c.href} className="hover:text-navy-800 hover:underline">
                {c.label}
              </Link>
            ) : (
              <span aria-current="page" className="font-medium text-navy-800">
                {c.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Breadcrumbs, title + short description, primary action(s) top right, optional filter bar below. */
export function PageHeader({
  title,
  description,
  actions,
  icon,
  breadcrumbs,
  filters,
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
  breadcrumbs?: Crumb[];
  filters?: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {icon && (
            <span className="mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl bg-navy-900 text-gold-400 shadow-sm [&_svg]:size-5">
              {icon}
            </span>
          )}
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-navy-900 sm:text-2xl">{title}</h1>
            {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
      {filters && <div className="mt-4 flex flex-wrap items-center gap-2">{filters}</div>}
    </div>
  );
}

type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "gold";
const TONES: Record<Tone, string> = {
  neutral: "bg-cream-100 text-ink-muted ring-line",
  success: "bg-peacock-50 text-peacock-800 ring-peacock-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-100",
  danger: "bg-red-50 text-red-700 ring-red-100",
  info: "bg-navy-50 text-navy-700 ring-navy-100",
  gold: "bg-gold-100 text-gold-800 ring-gold-200",
};

export function Badge({ children, tone = "neutral", className }: { children: React.ReactNode; tone?: Tone; className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", TONES[tone], className)}>
      {children}
    </span>
  );
}

/** Each role has its own colour: Admin gold, Computer Staff navy, Teacher peacock green. */
const ROLE_TONE: Record<AppRole, string> = {
  admin: "bg-gold-100 text-gold-800 ring-gold-300",
  computer_staff: "bg-navy-100 text-navy-800 ring-navy-200",
  teacher: "bg-peacock-100 text-peacock-800 ring-peacock-200",
};

export function RoleBadge({ role, className }: { role: AppRole; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", ROLE_TONE[role], className)}>
      {ROLE_LABELS[role]}
    </span>
  );
}

/** Empty state with a small open-book illustration and a helpful message. */
export function EmptyState({ title, children, action }: { title?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[var(--radius-card)] border border-dashed border-cream-400 bg-cream-50 px-6 py-8 text-center">
      <svg viewBox="0 0 64 48" className="h-12 w-16" aria-hidden>
        <path d="M32 10c-7-5-17-6-26-4v34c9-2 19-1 26 4 7-5 17-6 26-4V6c-9-2-19-1-26 4Z" fill="#fcf6ea" stroke="#14325f" strokeWidth="2" strokeLinejoin="round" />
        <path d="M32 10v34" stroke="#14325f" strokeWidth="2" />
        <path d="M12 16c5-1 10-.5 14 1.5M12 23c5-1 10-.5 14 1.5M38 17.5c4-2 9-2.5 14-1.5M38 24.5c4-2 9-2.5 14-1.5" stroke="#e6a924" strokeWidth="2" strokeLinecap="round" />
      </svg>
      {title && <p className="font-medium text-navy-900">{title}</p>}
      <p className="max-w-md text-sm text-muted">{children}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** Responsive table wrapper with consistent styling and row hover. */
export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-[var(--radius-card)] border border-border bg-surface shadow-[var(--shadow-soft)]">
      <table className="w-full text-left text-sm [&_tbody_tr]:border-t [&_tbody_tr]:border-border [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-cream-50 [&_td]:px-4 [&_td]:py-2.5 [&_th]:whitespace-nowrap [&_th]:bg-cream-100/60 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-xs [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-ink-muted">
        {children}
      </table>
    </div>
  );
}

/** Status → colour chip used across modules. Unknown statuses fall back to neutral. */
const STATUS_TONE: Record<string, Tone> = {
  active: "success",
  current: "gold",
  planned: "info",
  closed: "neutral",
  inactive: "warning",
  left: "danger",
  tc_issued: "warning",
  passed_out: "info",
  promoted: "success",
  detained: "danger",
  declared: "info",
  second_saturday: "gold",
  scholastic: "info",
  co_scholastic: "gold",
  optional: "neutral",
  yes: "success",
  no: "neutral",
};

export function StatusChip({ status, label }: { status: string; label?: string }) {
  const tone = STATUS_TONE[status] ?? "neutral";
  const text = label ?? status.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
  return (
    <Badge tone={tone}>
      <span className={cn("size-1.5 rounded-full", { success: "bg-peacock-600", gold: "bg-gold-500", info: "bg-navy-500", neutral: "bg-ink-muted", warning: "bg-amber-600", danger: "bg-red-600" }[tone])} aria-hidden />
      {text}
    </Badge>
  );
}
