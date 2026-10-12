"use client";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/** Compact icon button for table row actions (always has an accessible label). */
export const IconButton = forwardRef<HTMLButtonElement, React.ButtonHTMLAttributes<HTMLButtonElement> & { label: string; tone?: "default" | "danger" }>(
  function IconButton({ label, tone = "default", className, children, ...props }, ref) {
    return (
      <button
        ref={ref}
        type="button"
        aria-label={label}
        title={label}
        className={cn(
          "inline-grid size-8 place-items-center rounded-lg transition-colors [&_svg]:size-4",
          tone === "danger" ? "text-red-700 hover:bg-red-50" : "text-navy-600 hover:bg-navy-50 hover:text-navy-900",
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);
