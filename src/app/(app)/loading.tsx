import { TableSkeleton } from "@/components/data-table/data-table";

export default function Loading() {
  return (
    <div className="space-y-5" aria-label="Loading">
      <div className="space-y-2">
        <div className="skeleton h-3 w-40 rounded" />
        <div className="skeleton h-7 w-64 rounded" />
      </div>
      <div className="flex gap-2">
        <div className="skeleton h-9 w-60 rounded-lg" />
        <div className="skeleton h-9 w-24 rounded-lg" />
      </div>
      <TableSkeleton />
    </div>
  );
}
