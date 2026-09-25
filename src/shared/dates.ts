import type { Item } from "./types";

/** Best guess at when a file was made: photo capture time, else the earlier of created/modified. */
export function itemDate(item: Item): number {
  if (item.takenMs && item.takenMs > 0) return item.takenMs;
  const candidates = [item.birthtimeMs, item.mtimeMs].filter((t) => Number.isFinite(t) && t > 0);
  return candidates.length ? Math.min(...candidates) : 0;
}

export function yearOf(ms: number): number {
  return new Date(ms).getFullYear();
}

export function monthOf(ms: number): string {
  return String(new Date(ms).getMonth() + 1).padStart(2, "0");
}

/** Last plausible year (1990 to 2039) written in a string, e.g. "tax-return-2019" → 2019. */
export function yearIn(s: string): number | null {
  const found = [...s.matchAll(/(?:^|[^0-9])((?:19|20)\d{2})(?![0-9])/g)]
    .map((m) => Number(m[1]))
    .filter((y) => y >= 1990 && y <= 2039);
  return found.length ? found[found.length - 1]! : null;
}
