// DataTable must never loop, whatever the caller passes: an inline
// getRowId, rows/columns rebuilt on every render, no `filters` prop at all.
// (Regression: /fees/setup froze with "Maximum update depth exceeded".)
import { afterEach, describe, expect, it, vi } from "vitest";
import { Profiler, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/features/audit/actions", () => ({ logExport: vi.fn() }));
vi.mock("@/lib/export", () => ({ exportSheets: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { DataTable, type Column } from "@/components/data-table/data-table";

type Row = { id: string; name: string; n: number };
const DATA = Array.from({ length: 30 }, (_, i) => ({ id: `r${i}`, name: `Row ${i}`, n: i }));

/** Parent that rebuilds EVERYTHING each render and re-renders itself on demand. */
function Unstable({ onRender, selectable = true }: { onRender: () => void; selectable?: boolean }) {
  const [tick, setTick] = useState(0);
  const rows: Row[] = DATA.map((r) => ({ ...r })); // new array + new objects each render
  const columns: Column<Row>[] = [
    { id: "name", header: "Name", cell: (r) => r.name, sortValue: (r) => r.name },
    { id: "n", header: "N", cell: (r) => r.n, sortValue: (r) => r.n, defaultHidden: true },
  ];
  return (
    <Profiler id="t" onRender={onRender}>
      <button onClick={() => setTick((t) => t + 1)}>rerender {tick}</button>
      <DataTable
        id="unstable"
        rows={rows}
        columns={columns}
        getRowId={(r) => r.id} // inline, new every render
        selectable={selectable}
        searchText={(r) => r.name}
        // no `filters` prop on purpose
        rowActions={(r) => [{ id: "v", kind: "view", label: "View", onClick: () => void r }]}
        bulkActions={() => <span>bulk</span>}
      />
    </Profiler>
  );
}

afterEach(cleanup);

describe("DataTable stability", () => {
  it("renders a bounded number of times with unstable props (no filters prop)", async () => {
    const onRender = vi.fn();
    render(<Unstable onRender={onRender} />);
    await new Promise((r) => setTimeout(r, 150)); // let any effect loop run
    expect(screen.getByText("Row 0")).toBeTruthy();
    expect(onRender.mock.calls.length).toBeLessThan(15);
  });

  it("stays bounded across parent re-renders and selection changes", async () => {
    const onRender = vi.fn();
    render(<Unstable onRender={onRender} />);
    const boxes = screen.getAllByLabelText("Select row");
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByText(/rerender/));
    await new Promise((r) => setTimeout(r, 150));
    // rows were rebuilt but the same ids still exist: selection must survive
    expect(screen.getByText("2 selected")).toBeTruthy();
    expect(onRender.mock.calls.length).toBeLessThan(30);
  });

  it("drops a selected id only when its row is really gone", async () => {
    const onRender = vi.fn();
    render(<Unstable onRender={onRender} />);
    fireEvent.click(screen.getAllByLabelText("Select row")[0]);
    expect(screen.getByText("1 selected")).toBeTruthy();
    // searching hides Row 0 -> it must be removed from the selection
    fireEvent.change(screen.getByPlaceholderText("Search…"), { target: { value: "Row 29" } });
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByText("1 selected")).toBeNull();
  });
});
