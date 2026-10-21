import { DEMO_MODE } from "@/lib/demo";

/** A small label on every page of the public demo site. Renders nothing anywhere else. */
export function DemoBanner() {
  if (!DEMO_MODE) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-[60] flex justify-center px-3 print:hidden" role="note">
      <span className="rounded-full bg-navy-900/90 px-3 py-1 text-xs font-medium text-cream-50 shadow-lg ring-1 ring-gold-400/60">
        Demo with dummy data only · uploads and account changes are turned off
      </span>
    </div>
  );
}
