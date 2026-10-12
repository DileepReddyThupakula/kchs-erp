import Link from "next/link";
import { ShieldX } from "lucide-react";
import { buttonClasses } from "@/components/ui/button-classes";

export const metadata = { title: "Not allowed" };

/** Shown when someone opens a page their role/duties don't allow. No data is loaded. */
export default function NotAllowedPage() {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center py-16 text-center">
      <span className="grid size-14 place-items-center rounded-2xl bg-red-50 text-red-700 ring-1 ring-red-100">
        <ShieldX className="size-7" aria-hidden />
      </span>
      <h1 className="mt-4 text-xl font-semibold text-navy-900">You don&apos;t have access to this page</h1>
      <p className="mt-2 text-sm text-muted">
        It isn&apos;t part of your role or duties. If you need it for your work, ask the Admin to give you the right duty.
      </p>
      <Link href="/dashboard" className={buttonClasses("primary", "md", "mt-6")}>
        Back to dashboard
      </Link>
    </div>
  );
}
