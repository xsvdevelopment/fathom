import { classifyLoose, classifySmart, type Loose } from "./classify";
import { planFolders, type FolderOptions } from "./folders";
import { itemDate, monthOf, yearOf } from "./dates";
import { KIND_LABEL } from "./kinds";
import { isNoiseFolder } from "./noise";
import { parentPath, posixJoin } from "./paths";
import { expandTemplate, matchRule } from "./rules";
import { settleLoose } from "./settle";
import type { Item, Layout, Proposal, Rule } from "./types";

export const REVIEW_DIR = "_Fathom Review";

export const LAYOUT_LABEL: Record<Layout, string> = {
  smart: "Smart",
  type: "By type",
  date: "By date",
  flat3: "Max 3 deep",
  flat2: "Max 2 deep",
  inplace: "Keep in place",
};

function flatten(rel: string, levels: number): string {
  return parentPath(rel).split("/").filter(Boolean).slice(0, levels).join("/");
}

function byLayout(item: Item, layout: Layout): Proposal {
  switch (layout) {
    case "smart":
      return classifySmart(item);
    case "type":
      if (item.type === "unit") return { dest: "Code", reason: "Project folder" };
      return { dest: `${KIND_LABEL[item.kind]}/${yearOf(itemDate(item))}`, reason: `${KIND_LABEL[item.kind]}, by year` };
    case "date":
      if (item.type === "unit") return { dest: "Code", reason: "Project folder" };
      return { dest: `${yearOf(itemDate(item))}/${monthOf(itemDate(item))}`, reason: "By date" };
    case "flat2":
      return { dest: flatten(item.rel, 2), reason: "Flattened to 2 levels" };
    case "flat3":
      return { dest: flatten(item.rel, 3), reason: "Flattened to 3 levels" };
    case "inplace":
      return { dest: parentPath(item.rel), reason: "Kept in place" };
  }
}

/**
 * Proposes a destination dir for every item: user rules, then workspaces, then duplicates, then the layout.
 * Smart places whole folders first (see planFolders); only loose files are sorted one by one, and those are
 * settled together at the end (see settleLoose) so they can join folders the plan keeps.
 */
export function proposeAll(
  items: Item[],
  layout: Layout,
  rules: Rule[],
  now: number,
  opts: FolderOptions = {},
): Map<string, Proposal> {
  const active = rules.filter((r) => r.enabled);
  const out = new Map<string, Proposal>();
  const folders = layout === "smart" ? planFolders(items, opts) : null;
  const loose: { item: Item; placed: Loose }[] = [];
  const kept = new Set<string>();
  for (const item of items) {
    const rule = active.find((r) => matchRule(item, r, now));
    const placed = folders?.get(item.id);
    if (rule) {
      out.set(item.id, { dest: expandTemplate(rule.target, item), reason: `Rule: ${rule.name}` });
    } else if (placed?.firm) {
      out.set(item.id, { dest: placed.dest, reason: placed.reason });
    } else if (item.duplicateOf && layout !== "inplace") {
      out.set(item.id, {
        dest: posixJoin(REVIEW_DIR, "Duplicates", ...parentPath(item.rel).split("/").filter((d) => !isNoiseFolder(d))),
        reason: "Exact duplicate, set aside for review and never deleted",
      });
    } else if (placed) {
      out.set(item.id, { dest: placed.dest, reason: placed.reason });
      // A project at the top is "kept" in the root itself; that is not a folder to file things into.
      if (item.type === "file") kept.add(placed.dest);
    } else if (layout === "smart") {
      // Held back so the map keeps scan order; filled in below.
      out.set(item.id, { dest: "", reason: "" });
      loose.push({ item, placed: classifyLoose(item) });
    } else {
      out.set(item.id, byLayout(item, layout));
    }
  }
  for (const [id, p] of settleLoose(loose, [...kept])) out.set(id, p);
  return out;
}
