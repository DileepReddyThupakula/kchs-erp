/** Shown at once while the dashboard's data loads (cards, not a table). */
export default function DashboardLoading() {
  return (
    <div aria-label="Loading the dashboard" className="space-y-5">
      <div className="space-y-2">
        <div className="skeleton h-3 w-40 rounded" />
        <div className="skeleton h-8 w-72 rounded" />
        <div className="skeleton h-3 w-48 rounded" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="skeleton h-44 rounded-[var(--radius-card)]" />
        <div className="skeleton h-44 rounded-[var(--radius-card)]" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-20 rounded-[var(--radius-card)]" />
        ))}
      </div>
    </div>
  );
}
