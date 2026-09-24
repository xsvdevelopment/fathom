import { STRUCTURAL } from "./classify";
import { isNoiseFolder } from "./noise";
import type { Item } from "./types";

/** Folders that collect everything; never a workspace even when code lands in them. */
const CONTAINERS = new Set([...STRUCTURAL, "desktop", "downloads", "download", "my documents"]);

const PERSONAL_KINDS = new Set(["image", "video", "audio", "spreadsheet", "presentation", "design", "ebook"]);
const PERSONAL_DOCS = new Set([".pdf", ".doc", ".docx", ".rtf", ".odt", ".pages", ".wpd"]);

/** Photos, office files, PDFs: things a person made or keeps. Notes (.md, .txt) and logs are neutral. */
const isPersonal = (i: Item) => i.type === "file" && (PERSONAL_KINDS.has(i.kind) || PERSONAL_DOCS.has(i.ext));

type Tally = { units: number; code: number; personal: number; total: number };

export type Workspaces = {
  /** `${root}\0${rel}` of each workspace folder. */
  dirs: Set<string>;
  /** Roots that are themselves a workspace. */
  roots: Set<string>;
};

/**
 * A workspace is a folder someone works in: it holds projects or code, and personal files (photos, PDFs,
 * office documents) are at most a quarter of what's in it. Everything inside a workspace stays together,
 * where it is — a folder of projects, notes, dumps and APKs is not split up by file type. The outermost
 * such folder wins. Desktop, Downloads, Documents and other catch-all folders never count, and neither do
 * noise names ("New folder", "old"): a project buried in those still gets rescued.
 */
export function findWorkspaces(items: Item[]): Workspaces {
  const tallies = new Map<string, Tally>();
  const bump = (key: string, it: Item) => {
    let t = tallies.get(key);
    if (!t) tallies.set(key, (t = { units: 0, code: 0, personal: 0, total: 0 }));
    t.total += 1;
    if (it.type === "unit") t.units += 1;
    else if (it.kind === "code") t.code += 1;
    if (isPersonal(it)) t.personal += 1;
  };
  for (const it of items) {
    const parts = it.rel.split("/");
    bump(`${it.root}\0`, it);
    for (let d = 1; d < parts.length; d += 1) bump(`${it.root}\0${parts.slice(0, d).join("/")}`, it);
  }

  const qualifies = (t: Tally) => (t.units >= 1 || t.code >= 2) && t.personal * 4 <= t.total;
  const dirs = new Set<string>();
  const roots = new Set<string>();
  const byDepth = [...tallies].sort((a, b) => a[0].split("/").length - b[0].split("/").length);
  for (const [key, t] of byDepth) {
    const [root, rel] = key.split("\0") as [string, string];
    if (!rel) {
      if (qualifies(t)) roots.add(root);
      continue;
    }
    const parts = rel.split("/");
    const name = parts.at(-1)!;
    if (CONTAINERS.has(name.toLowerCase().trim())) continue;
    if (parts.some((_, i) => dirs.has(`${root}\0${parts.slice(0, i).join("/")}`))) continue;
    // A noise-named folder ("qq", "NewWork - Copy") is still a workspace when it clearly holds work;
    // one lone project buried in "New folder/old" is not, so it still gets rescued.
    const enough = !isNoiseFolder(name) || t.units >= 2 || t.code >= 2;
    if (enough && qualifies(t)) dirs.add(key);
  }
  return { dirs, roots };
}

/** The workspace folder an item sits in, if any. */
export function workspaceOf(item: Item, ws: Workspaces): string | undefined {
  const parts = item.rel.split("/");
  for (let d = 1; d < parts.length; d += 1) {
    const rel = parts.slice(0, d).join("/");
    if (ws.dirs.has(`${item.root}\0${rel}`)) return rel;
  }
  return undefined;
}
