import { TableSkeleton } from "@/components/data-table/data-table";

/** Shown at once while a page of this area loads: title, tabs, then the table. */
export default function AreaLoading() {
  return (
    <div className="space-y-4" aria-label="Loading">
      <div className="space-y-2">
        <div className="skeleton h-3 w-40 rounded" />
        <div className="skeleton h-7 w-64 rounded" />
      </div>
      <div className="flex gap-4 border-b border-border pb-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-5 w-24 rounded" />
        ))}
      </div>
      <TableSkeleton />
    </div>
  );
}
