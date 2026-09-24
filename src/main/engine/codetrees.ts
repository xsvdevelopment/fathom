import type { Item } from "@shared/types";
import { itemId } from "./ids";

const MIN_ITEMS = 20;

/** Kinds a machine writes, not a person: build output, dumps, app data. */
const MACHINE = new Set(["code", "data", "other"]);

/** Paperwork every code folder carries; it doesn't make the folder personal. */
const CODE_PAPERWORK = /^(readme|license|licence|changelog|changes|notice|authors|contributing|copying|todo)\b/i;

type Tally = {
  root: string;
  rel: string;
  depth: number;
  total: number;
  code: number;
  machine: number;
  /** Files a person made, sitting directly in this folder. */
  personalHere: number;
};

function ancestors(rel: string): string[] {
  const parts = rel.split("/");
  return parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join("/"));
}

/**
 * Finds folders that are mostly code but carry no project marker (a disassembly, a source dump, pulled app
 * data) and turns each into one unit, so it moves whole instead of being scattered file by file.
 *
 * A folder qualifies when it holds at least 20 things, at least half of them code and nine in ten of them
 * machine-made, and no personal file sits loose directly inside it. The shallowest qualifying folder wins: it is
 * the project root, and nothing inside it is made shallower. A scanned root itself never collapses.
 */
export function collapseCodeTrees(items: Item[]): Item[] {
  const tallies = new Map<string, Tally>();
  for (const it of items) {
    const code = it.type === "unit" || it.kind === "code";
    const machine = code || MACHINE.has(it.kind);
    const dirs = ancestors(it.rel);
    dirs.forEach((dir, i) => {
      const key = `${it.root}\0${dir}`;
      let t = tallies.get(key);
      if (!t) {
        t = { root: it.root, rel: dir, depth: i + 1, total: 0, code: 0, machine: 0, personalHere: 0 };
        tallies.set(key, t);
      }
      t.total += 1;
      if (code) t.code += 1;
      if (machine) t.machine += 1;
      if (i === dirs.length - 1) {
        if (!machine && !CODE_PAPERWORK.test(it.name)) t.personalHere += 1;
      }
    });
  }

  const qualifies = (t: Tally) =>
    t.total >= MIN_ITEMS &&
    t.code * 2 >= t.total &&
    t.machine * 10 >= t.total * 9 &&
    t.personalHere === 0;
  const chosen = new Set<string>();
  for (const t of [...tallies.values()].filter(qualifies).sort((a, b) => a.depth - b.depth)) {
    if (ancestors(`${t.rel}/x`).some((d) => chosen.has(`${t.root}\0${d}`))) continue;
    chosen.add(`${t.root}\0${t.rel}`);
  }
  if (!chosen.size) return items;

  const units = new Map<string, Item>();
  const out: Item[] = [];
  for (const it of items) {
    const tree = ancestors(it.rel).find((d) => chosen.has(`${it.root}\0${d}`));
    if (!tree) {
      out.push(it);
      continue;
    }
    const key = `${it.root}\0${tree}`;
    let u = units.get(key);
    if (!u) {
      u = {
        id: itemId(it.root, tree),
        type: "unit",
        root: it.root,
        rel: tree,
        name: tree.split("/").pop()!,
        ext: "",
        size: 0,
        mtimeMs: 0,
        birthtimeMs: Number.POSITIVE_INFINITY,
        kind: "other",
        fileCount: 0,
        unitReason: "Code folder",
      };
      units.set(key, u);
      out.push(u);
    }
    u.size += it.size;
    u.fileCount! += it.type === "unit" ? (it.fileCount ?? 1) : 1;
    u.mtimeMs = Math.max(u.mtimeMs, it.mtimeMs);
    u.birthtimeMs = Math.min(u.birthtimeMs, it.birthtimeMs);
  }
  return out;
}
