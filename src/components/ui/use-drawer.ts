"use client";
import { useCallback, useState } from "react";

/** Drawer state for "add new" / "edit this row". */
export function useDrawer<T>() {
  const [state, setState] = useState<{ open: boolean; item: T | null }>({ open: false, item: null });
  const openNew = useCallback(() => setState({ open: true, item: null }), []);
  const openEdit = useCallback((item: T) => setState({ open: true, item }), []);
  const close = useCallback(() => setState((s) => ({ ...s, open: false })), []);
  return { ...state, openNew, openEdit, close };
}
