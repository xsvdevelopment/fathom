import { isNoiseFolder } from "./noise";
import { stemOf } from "./paths";
import type { Item } from "./types";

/** Names an OS or a browser gives a second copy: "Copy of x", "x - Copy", "x (1)", "x copy 2". */
export function isCopyName(name: string): boolean {
  const stem = stemOf(name).trim().toLowerCase();
  return /^copy of\b/.test(stem) || /( - copy| copy)( \(?\d+\)?)?$/.test(stem) || / \(\d+\)$/.test(stem);
}

/** True when some folder above the file was named by a person: someone filed it there on purpose. */
function isFiled(item: Item): boolean {
  return item.rel.split("/").slice(0, -1).some((d) => !isNoiseFolder(d));
}

const depth = (i: Item) => i.rel.split("/").length;

/**
 * Orders exact copies so the one worth keeping comes first: the original name over "Copy of" and "(1)",
 * then a copy someone filed in a named folder over one lying in Desktop or Downloads, then the shallowest,
 * then the oldest.
 */
export function keeperOrder(a: Item, b: Item): number {
  return (
    Number(isCopyName(a.name)) - Number(isCopyName(b.name)) ||
    Number(isFiled(b)) - Number(isFiled(a)) ||
    depth(a) - depth(b) ||
    a.mtimeMs - b.mtimeMs ||
    a.rel.localeCompare(b.rel)
  );
}
