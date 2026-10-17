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

// ---------------------------------------------------------------- server-side mode (the Students list)
import type { ServerTable } from "@/components/data-table/data-table";
import { act } from "@testing-library/react";

describe("DataTable server mode", () => {
  const PAGE = Array.from({ length: 50 }, (_, i) => ({ id: `p${i}`, name: `Page row ${i}`, n: i }));
  const cols: Column<Row>[] = [
    { id: "name", header: "Name", cell: (r) => r.name, sortValue: (r) => r.name },
    { id: "n", header: "N", cell: (r) => r.n, sortValue: (r) => r.n },
  ];
  const base = (over: Partial<ServerTable> = {}): ServerTable => ({ total: 439, page: 1, pageSize: 50, query: "", filters: {}, sort: null, sortable: ["name"], onChange: vi.fn(), ...over });
  const show = (server: ServerTable) =>
    render(<DataTable id="srv" rows={PAGE} columns={cols} getRowId={(r) => r.id} searchText={() => ""} filters={[{ id: "cls", label: "Class", options: [{ value: "a", label: "Class A" }] }]} server={server} />);

  it("shows only the rows it is given and the true total", () => {
    show(base());
    expect(screen.getAllByText(/^Page row/).length).toBe(50);
    expect(screen.getByText("51–100 of 439 records")).toBeTruthy();
    expect(screen.getByText("2 / 9")).toBeTruthy();
  });

  it("paging asks the server for the next / previous page (it does not slice locally)", () => {
    const server = base();
    show(server);
    fireEvent.click(screen.getByLabelText("Next page"));
    expect(server.onChange).toHaveBeenLastCalledWith({ page: 2 });
    fireEvent.click(screen.getByLabelText("Previous page"));
    expect(server.onChange).toHaveBeenLastCalledWith({ page: 0 });
  });

  it("the last page disables Next, the first page disables Previous", () => {
    show(base({ page: 8, total: 439 }));
    expect((screen.getByLabelText("Next page") as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    show(base({ page: 0 }));
    expect((screen.getByLabelText("Previous page") as HTMLButtonElement).disabled).toBe(true);
  });

  it("choosing a filter goes to the server and returns to page 1", () => {
    const server = base();
    show(server);
    fireEvent.click(screen.getByText("Class"));
    fireEvent.click(screen.getByText("Class A"));
    expect(server.onChange).toHaveBeenLastCalledWith({ filters: { cls: "a" }, page: 0 });
  });

  it("typing in the search box is sent to the server after a short pause, once", () => {
    vi.useFakeTimers();
    try {
      const server = base();
      show(server);
      const box = screen.getByPlaceholderText("Search…");
      fireEvent.change(box, { target: { value: "ra" } });
      fireEvent.change(box, { target: { value: "ravi" } });
      expect(server.onChange).not.toHaveBeenCalled();
      act(() => void vi.advanceTimersByTime(400));
      expect(server.onChange).toHaveBeenCalledTimes(1);
      expect(server.onChange).toHaveBeenCalledWith({ query: "ravi", page: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  it("only the columns the server can sort are sortable, and sorting is sent to the server", () => {
    const server = base();
    show(server);
    expect(screen.queryByRole("button", { name: "N" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Name" }));
    expect(server.onChange).toHaveBeenLastCalledWith({ sort: { id: "name", dir: "asc" }, page: 0 });
  });

  it("an empty page with a search says 'No matches', an empty list says the empty message", () => {
    render(<DataTable id="e1" rows={[]} columns={cols} getRowId={(r) => r.id} searchText={() => ""} server={base({ total: 0, page: 0, query: "zzz" })} emptyTitle="Nothing yet" />);
    expect(screen.getByText("No matches")).toBeTruthy();
    cleanup();
    render(<DataTable id="e2" rows={[]} columns={cols} getRowId={(r) => r.id} searchText={() => ""} server={base({ total: 0, page: 0 })} emptyTitle="Nothing yet" />);
    expect(screen.getByText("Nothing yet")).toBeTruthy();
  });
});
