"use client";
import { useCallback, useState } from "react";

/** Drawer state: "add new", "view this row" (read-only) or "edit this row". */
export function useDrawer<T>() {
  const [state, setState] = useState<{ open: boolean; item: T | null; mode: "view" | "edit" }>({ open: false, item: null, mode: "edit" });
  const openNew = useCallback(() => setState({ open: true, item: null, mode: "edit" }), []);
  const openEdit = useCallback((item: T) => setState({ open: true, item, mode: "edit" }), []);
  const openView = useCallback((item: T) => setState({ open: true, item, mode: "view" }), []);
  const toEdit = useCallback(() => setState((s) => ({ ...s, mode: "edit" })), []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  return { ...state, readOnly: state.mode === "view", openNew, openEdit, openView, toEdit, close };
}
