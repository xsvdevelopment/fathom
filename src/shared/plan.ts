import { posixJoin } from "./paths";
import type { Item, PlanItem, Proposal } from "./types";

/** One item as the plan currently sees it. */
export type Row = {
  item: Item;
  /** Destination dir, "/"-separated, relative to the destination root. */
  dest: string;
  /** Full new path relative to the destination root. */
  newRel: string;
  moved: boolean;
  excluded: boolean;
  pinned: boolean;
  reason: string;
};

export function joinAbs(root: string, rel: string): string {
  const sep = root.includes("\\") || /^[a-z]:$/i.test(root) ? "\\" : "/";
  const base = root.replace(/[\\/]+$/, "");
  return rel ? `${base}${sep}${rel.split("/").join(sep)}` : base;
}

const sameRoot = (a: string, b: string) => a.replace(/[\\/]+$/, "").toLowerCase() === b.replace(/[\\/]+$/, "").toLowerCase();

export function buildRows(
  items: Item[],
  proposals: Map<string, Proposal>,
  overrides: Record<string, string>,
  excluded: Record<string, true>,
  destRoot: string,
): Row[] {
  return items.map((item) => {
    const isExcluded = Boolean(excluded[item.id]);
    const override = overrides[item.id];
    const proposal = proposals.get(item.id);
    const inPlace = item.rel.includes("/") ? item.rel.slice(0, item.rel.lastIndexOf("/")) : "";
    const dest = isExcluded ? inPlace : (override ?? proposal?.dest ?? inPlace);
    const newRel = isExcluded ? item.rel : posixJoin(dest, item.name);
    const moved = !isExcluded && (newRel !== item.rel || !sameRoot(item.root, destRoot));
    return {
      item,
      dest,
      newRel,
      moved,
      excluded: isExcluded,
      pinned: override !== undefined && !isExcluded,
      reason: isExcluded ? "Staying put (you excluded it)" : override !== undefined ? "Placed by you" : (proposal?.reason ?? ""),
    };
  });
}

export function toPlanItems(rows: Row[], destRoot: string): PlanItem[] {
  return rows
    .filter((r) => r.moved)
    .map((r) => ({
      id: r.item.id,
      type: r.item.type,
      from: joinAbs(r.item.root, r.item.rel),
      to: joinAbs(destRoot, r.newRel),
      size: r.item.size,
      mtimeMs: r.item.mtimeMs,
    }));
}

const csvCell = (v: string | number | boolean) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export function planCsv(rows: Row[], destRoot: string): string {
  const lines = ["name,from,to,reason,size_bytes,moves"];
  for (const r of rows) {
    lines.push(
      [r.item.name, joinAbs(r.item.root, r.item.rel), joinAbs(destRoot, r.newRel), r.reason, r.item.size, r.moved]
        .map(csvCell)
        .join(","),
    );
  }
  return lines.join("\n");
}
