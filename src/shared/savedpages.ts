import { parentPath, posixJoin, stemOf } from "./paths";
import type { Item } from "./types";

export type SavedPages = {
  /** Ids of the ".html" files that have a "_files" folder beside them. */
  pages: Set<string>;
  /** For each item inside such a folder, the page it belongs to. */
  pageOf: Map<string, Item>;
};

/**
 * A browser saves a complete page as "Name.html" beside a "Name_files" folder holding its scripts, styles and
 * images. The two are one thing: the page only opens properly while they sit together, and the scripts in the
 * folder are not anyone's code.
 */
export function findSavedPages(items: Item[]): SavedPages {
  const key = (root: string, rel: string) => `${root}\0${rel.toLowerCase()}`;
  const byFolder = new Map<string, Item>();
  for (const it of items) {
    if (it.type !== "file" || !/^\.html?$/.test(it.ext)) continue;
    byFolder.set(key(it.root, posixJoin(parentPath(it.rel), `${stemOf(it.name)}_files`)), it);
  }
  const pages = new Set<string>();
  const pageOf = new Map<string, Item>();
  if (!byFolder.size) return { pages, pageOf };
  for (const it of items) {
    for (let dir = parentPath(it.rel); dir; dir = parentPath(dir)) {
      const page = byFolder.get(key(it.root, dir));
      if (!page) continue;
      pages.add(page.id);
      pageOf.set(it.id, page);
      break;
    }
  }
  return { pages, pageOf };
}
