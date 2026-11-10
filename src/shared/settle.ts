import { isMeaningful, resolveLoose, words, type AreaName, type Loose } from "./classify";
import { stemOf } from "./paths";
import type { Item, Proposal } from "./types";

/** Deepest folder a loose file is pulled into by its name: below this, a name match is a coincidence. */
const ANCHOR_DEPTH = 4;

const isYear = (t: string) => /^(19|20)\d{2}$/.test(t);
const singular = (t: string) => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t);

/** Lowercased words of a name, plurals folded, so "Recipes" and "recipe" meet. */
const tokens = (s: string) =>
  words(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .map(singular);

type Anchor = { key: string[]; dest: string; name: string };

/**
 * Folders the plan already keeps, indexed by the first word of their name. A folder can anchor loose files
 * when a person named it for a topic ("Thesis", "Acme", "Italy 2019"): not a catch-all, not a bare number,
 * and not so deep that it's one step in someone's private filing.
 */
function findAnchors(dests: Iterable<string>): Map<string, Anchor[]> {
  const byName = new Map<string, Anchor | null>();
  const seen = new Set<string>();
  for (const full of dests) {
    const parts = full.split("/").filter(Boolean);
    for (let d = 1; d <= Math.min(parts.length, ANCHOR_DEPTH); d += 1) {
      const dest = parts.slice(0, d).join("/");
      if (seen.has(dest)) continue;
      seen.add(dest);
      const name = parts[d - 1]!;
      if (!isMeaningful(name)) continue;
      const key = tokens(name).filter((t) => !isYear(t) && !/^\d+$/.test(t));
      if (key.join("").length < 4) continue;
      const k = key.join(" ");
      const had = byName.get(k);
      // The same name in two places says nothing about which one a file belongs to, unless one is plainly
      // the main one (shallower).
      if (had === undefined) byName.set(k, { key, dest, name });
      else if (had === null || had.dest.split("/").length === d) byName.set(k, null);
      else if (had.dest.split("/").length > d) byName.set(k, { key, dest, name });
    }
  }
  const index = new Map<string, Anchor[]>();
  for (const a of byName.values()) {
    if (!a) continue;
    const list = index.get(a.key[0]!);
    if (list) list.push(a);
    else index.set(a.key[0]!, [a]);
  }
  return index;
}

/** The kept folder whose whole name appears in this file's name; the longest name wins. */
function anchorFor(item: Item, index: Map<string, Anchor[]>): Anchor | undefined {
  const name = tokens(stemOf(item.name));
  let best: Anchor | undefined;
  for (let i = 0; i < name.length; i += 1) {
    for (const a of index.get(name[i]!) ?? []) {
      if (best && best.key.length >= a.key.length) continue;
      if (a.key.every((t, j) => name[i + j] === t)) best = a;
    }
  }
  return best;
}

/** Other names for a whole area. Topics inside one ("Recipes", "Thesis") are not the area itself. */
const AREA_ALIASES: [AreaName, RegExp][] = [
  ["Work", /^(work|works|job|jobs|office|business|career)$/],
  ["Studies", /^(school|university|uni|college|study|studies)$/],
  ["Personal", /^(personal|private)$/],
  ["Code", /^(code|dev|repos|repositories)$/],
];

/**
 * When the person already has a top folder that means the same as a built-in area ("School" for Studies,
 * "Job" for Work), loose files join it rather than starting a second one beside it.
 */
function areaAliases(dests: Iterable<string>): Map<string, string> {
  const tops = new Set<string>();
  for (const d of dests) {
    const top = d.split("/")[0];
    if (top) tops.add(top);
  }
  const out = new Map<string, string>();
  for (const [area, re] of AREA_ALIASES) {
    const exact = [...tops].find((t) => t.toLowerCase() === area.toLowerCase());
    if (exact) {
      if (exact !== area) out.set(area, exact);
      continue;
    }
    const alike = [...tops].filter((t) => re.test(words(t)));
    if (alike.length === 1) out.set(area, alike[0]!);
  }
  return out;
}

/**
 * Turns one-by-one guesses for loose files into final placements, now that the whole plan is in view:
 *
 * - A file whose placement was only a guess from its type joins a kept folder named in its own file name
 *   ("thesis FINAL.pdf" goes to "School/Thesis", "acme-logo.png" to "Work/Clients/Acme").
 * - Built-in areas reuse the person's own top folder for the same thing.
 * - Year folders appear only when a bucket is big enough to need them.
 *
 * `kept` are the destinations of folders that move whole and may take loose files in.
 */
export function settleLoose(loose: { item: Item; placed: Loose }[], kept: string[]): Map<string, Proposal> {
  const anchors = findAnchors(kept);
  const aliases = areaAliases(kept);
  const settled = loose.map(({ item, placed }) => {
    if (placed.weak && item.type === "file") {
      const a = anchorFor(item, anchors);
      if (a) return { item, placed: { base: a.dest, reason: `Matches your “${a.name}” folder` } as Loose };
    }
    const slash = placed.base.indexOf("/");
    const top = slash < 0 ? placed.base : placed.base.slice(0, slash);
    const alias = aliases.get(top);
    return alias ? { item, placed: { ...placed, base: alias + placed.base.slice(top.length) } } : { item, placed };
  });

  const sizes = new Map<string, number>();
  for (const { placed } of settled) {
    if (placed.year === undefined) continue;
    const k = placed.base.toLowerCase();
    sizes.set(k, (sizes.get(k) ?? 0) + 1);
  }
  const out = new Map<string, Proposal>();
  for (const { item, placed } of settled) out.set(item.id, resolveLoose(placed, sizes.get(placed.base.toLowerCase()) ?? 0));
  return out;
}
