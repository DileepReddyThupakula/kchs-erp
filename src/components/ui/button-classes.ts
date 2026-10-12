import { cn } from "@/lib/utils";

export type Variant = "primary" | "accent" | "secondary" | "danger" | "ghost";
export type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-navy-700 text-white shadow-sm hover:bg-navy-800 active:bg-navy-900",
  accent: "bg-gold-500 text-navy-900 shadow-sm hover:bg-gold-400 active:bg-gold-600",
  secondary: "border border-border bg-surface text-foreground shadow-sm hover:border-navy-200 hover:bg-navy-50",
  danger: "bg-red-600 text-white shadow-sm hover:bg-red-700",
  ghost: "text-foreground hover:bg-navy-50",
};
const sizes: Record<Size, string> = {
  sm: "h-8 px-2.5 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-11 px-5 text-base",
};

export function buttonClasses(variant: Variant = "primary", size: Size = "md", className?: string) {
  return cn(
    "inline-flex select-none items-center justify-center gap-2 rounded-lg font-medium transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-60",
    variants[variant],
    sizes[size],
    className,
  );
}

