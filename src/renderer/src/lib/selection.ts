import type { MouseEvent } from "react";
import { useApp } from "@/store/app";

/** Click = select one, Ctrl = toggle, Shift = range over `order` (the list as currently shown). */
export function clickSelect(e: MouseEvent, id: string, order: string[]) {
  const { selected, anchor, setSelected } = useApp.getState();
  if (e.shiftKey && anchor) {
    const a = order.indexOf(anchor);
    const b = order.indexOf(id);
    if (a >= 0 && b >= 0) {
      const [lo, hi] = a < b ? [a, b] : [b, a];
      const range = order.slice(lo, hi + 1);
      setSelected(e.ctrlKey || e.metaKey ? [...new Set([...selected, ...range])] : range);
      return;
    }
  }
  if (e.ctrlKey || e.metaKey) {
    setSelected(selected.includes(id) ? selected.filter((x) => x !== id) : [...selected, id], id);
    return;
  }
  setSelected(selected.length === 1 && selected[0] === id ? [] : [id], id);
}

export const DRAG_TYPE = "application/x-fathom-ids";

/** Starts a drag of the selection (or just this item if it isn't selected). */
export function startDrag(e: React.DragEvent, id: string) {
  const { selected, setSelected } = useApp.getState();
  const ids = selected.includes(id) ? selected : [id];
  if (!selected.includes(id)) setSelected([id], id);
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(ids));
  e.dataTransfer.effectAllowed = "move";
}

export function droppedIds(e: React.DragEvent): string[] {
  try {
    return JSON.parse(e.dataTransfer.getData(DRAG_TYPE)) as string[];
  } catch {
    return [];
  }
}
