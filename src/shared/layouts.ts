import { classifyLoose, classifySmart, type Loose } from "./classify";
import { planFolders, type FolderOptions } from "./folders";
import { itemDate, monthOf, yearOf } from "./dates";
import { KIND_LABEL, isShortcut } from "./kinds";
import { isNoiseFolder } from "./noise";
import { parentPath, posixJoin } from "./paths";
import { expandTemplate, matchRule } from "./rules";
import { findSavedPages } from "./savedpages";
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
  const fixed = new Set<string>();
  for (const item of items) {
    const rule = active.find((r) => matchRule(item, r, now));
    const placed = folders?.get(item.id);
    if (rule) {
      fixed.add(item.id);
      out.set(item.id, { dest: expandTemplate(rule.target, item), reason: `Rule: ${rule.name}` });
    } else if (placed?.firm) {
      out.set(item.id, { dest: placed.dest, reason: placed.reason });
    } else if (item.duplicateOf && layout !== "inplace" && !isShortcut(item.name)) {
      out.set(item.id, {
        dest: posixJoin(REVIEW_DIR, "Duplicates", ...parentPath(item.rel).split("/").filter((d) => !isNoiseFolder(d))),
        reason: "Exact duplicate, set aside for review and never deleted",
      });
    } else if (placed) {
      out.set(item.id, { dest: placed.dest, reason: placed.reason });
      // A project at the top is "kept" in the root itself; that is not a folder to file things into.
      if (item.type === "file") kept.add(placed.dest);
    } else if (item.type === "file" && isShortcut(item.name) && (layout === "smart" || layout === "type" || layout === "date")) {
      // Sorting by kind or date would sweep a desktop's shortcuts into a catch-all folder.
      out.set(item.id, { dest: parentPath(item.rel), reason: "Shortcut, left where it is" });
    } else if (layout === "smart") {
      // Held back so the map keeps scan order; filled in below.
      out.set(item.id, { dest: "", reason: "" });
      loose.push({ item, placed: classifyLoose(item) });
    } else {
      out.set(item.id, byLayout(item, layout));
    }
  }
  for (const [id, p] of settleLoose(loose, [...kept])) out.set(id, p);
  if (layout === "smart" || layout === "type" || layout === "date") keepSavedPagesWhole(items, out, fixed);
  return out;
}

/**
 * A saved page's "_files" folder goes wherever its page goes, in the same shape, even when a file inside it
 * would sort elsewhere, is a duplicate of one in another saved page, or looks like a code workspace.
 * `fixed` are the placements a user rule made; those stand.
 */
function keepSavedPagesWhole(items: Item[], out: Map<string, Proposal>, fixed: Set<string>): void {
  const { pageOf } = findSavedPages(items);
  if (!pageOf.size) return;
  for (const it of items) {
    const page = pageOf.get(it.id);
    if (!page || fixed.has(it.id)) continue;
    const pageDir = parentPath(page.rel);
    const inside = parentPath(it.rel).slice(pageDir ? pageDir.length + 1 : 0);
    out.set(it.id, { dest: posixJoin(out.get(page.id)!.dest, inside), reason: `Kept with the saved page “${page.name}”` });
  }
}
