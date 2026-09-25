import { AREA_WORDS, CAMERA_DIR, words } from "./classify";
import { yearIn } from "./dates";
import { isBlankFolder, isNoiseFolder } from "./noise";
import { parentPath, posixJoin, sanitizeSegment } from "./paths";
import type { Item, Kind, Proposal } from "./types";
import { findWorkspaces } from "./workspaces";

/** A folder-level placement. `firm` ones are never overridden, not even to set a duplicate aside. */
export type FolderProposal = Proposal & { firm?: boolean };

type Area = "Code" | "Media" | "Documents" | "Design" | "Inbox";

const AREA_OF: Record<Kind, Area> = {
  code: "Code",
  data: "Code",
  image: "Media",
  video: "Media",
  audio: "Media",
  document: "Documents",
  spreadsheet: "Documents",
  presentation: "Documents",
  ebook: "Documents",
  design: "Design",
  font: "Design",
  archive: "Inbox",
  installer: "Inbox",
  other: "Inbox",
};

type Dir = {
  root: string;
  rel: string;
  name: string;
  dirs: Dir[];
  /** Files and units sitting directly in this folder. */
  items: Item[];
  /** Everything below, by the area it would sort into. */
  tally: Record<Area, number>;
};

/** Names only a program would pick: a GUID or a long hash. */
const MACHINE_ID = /^\{?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\}?$|^[0-9a-f]{16,}$/i;

const FINANCE_NAME =/\b(tax|taxes|invoices?|receipts?|bank|statements?|payslips?|paystubs?|payroll|bills?)\b/;

/** Folders a camera or phone makes ("DCIM", "100APPLE"): their photos sort by date, not by folder. */
const isCameraDir = (name: string) => CAMERA_DIR.test(name) || /^(dcim|camera|camera roll)$/.test(words(name));

/** A folder someone named for what's in it: it moves as one piece. */
const isNamed = (name: string) => !isNoiseFolder(name) && !isCameraDir(name) && !MACHINE_ID.test(name);

function buildTrees(items: Item[]): Dir[] {
  const byKey = new Map<string, Dir>();
  const roots: Dir[] = [];
  const dirFor = (root: string, rel: string): Dir => {
    const key = `${root}\0${rel}`;
    let d = byKey.get(key);
    if (d) return d;
    d = { root, rel, name: rel.slice(rel.lastIndexOf("/") + 1), dirs: [], items: [], tally: { Code: 0, Media: 0, Documents: 0, Design: 0, Inbox: 0 } };
    byKey.set(key, d);
    if (rel) dirFor(root, parentPath(rel)).dirs.push(d);
    else roots.push(d);
    return d;
  };
  for (const it of items) {
    let d: Dir | undefined = dirFor(it.root, parentPath(it.rel));
    d.items.push(it);
    const area = it.type === "unit" ? "Code" : AREA_OF[it.kind];
    for (let rel = d.rel; ; rel = parentPath(rel)) {
      byKey.get(`${it.root}\0${rel}`)!.tally[area] += 1;
      if (!rel) break;
    }
  }
  const byName = (a: Dir, b: Dir) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  for (const d of byKey.values()) d.dirs.sort(byName);
  return roots;
}

function mainArea(d: Dir): Area {
  let best: Area = "Documents";
  for (const a of ["Code", "Media", "Documents", "Design", "Inbox"] as Area[]) if (d.tally[a] > d.tally[best]) best = a;
  return best;
}

/**
 * Smart placement, folder first. A folder someone named ("Stems for Album", "Italy 2019", "reveng") is one
 * piece: everything in it stays together, in the same shape. What changes:
 *
 * - Named folders at the top of a scanned root stay where they are.
 * - Named folders buried in clutter ("New folder/old/Italy 2019") are lifted out whole, to the area their
 *   contents belong to ("Media/Italy 2019"), or to Work/Studies/Personal when the name says so.
 * - Wrapper folders that say nothing ("New folder", "untitled 3", a zip's doubled "x/x") disappear, as long as
 *   no two names would then clash.
 *
 * Files with no named folder above them are left out of the result: they're loose and sort one by one.
 */
export function planFolders(items: Item[]): Map<string, FolderProposal> {
  const out = new Map<string, FolderProposal>();
  const ws = findWorkspaces(items);
  /** Lowercased names already placed in each destination folder. */
  const claims = new Map<string, Set<string>>();
  const claimed = (dest: string) => {
    const k = dest.toLowerCase();
    let s = claims.get(k);
    if (!s) claims.set(k, (s = new Set()));
    return s;
  };
  const isWorkspace = (d: Dir) => ws.dirs.has(`${d.root}\0${d.rel}`);

  /** Places `d`'s contents into `dest`, keeping its shape. */
  const place = (d: Dir, dest: string, label: string, how: "kept" | "lifted" | "workspace") => {
    const names = claimed(dest);
    const reason =
      how === "workspace"
        ? `Part of the “${label}” workspace — kept together`
        : how === "lifted"
          ? `Rescued “${label}” from clutter — moved whole`
          : `Kept with “${label}”`;
    for (const it of d.items) {
      names.add(it.name.toLowerCase());
      out.set(it.id, { dest, reason, firm: how === "workspace" });
    }
    const verbatim = how === "workspace";
    // A lone subfolder of a folder with nothing else in it folds up when it adds nothing: a zip's doubled
    // "x/x", or noise wrapping noise ("final/use this").
    const wrapper = d.items.length === 0 && d.dirs.length === 1;
    const merge = (sub: Dir) =>
      !verbatim &&
      !isWorkspace(sub) &&
      (isBlankFolder(sub.name) ||
        (wrapper && (words(sub.name) === words(d.name) || (isNoiseFolder(d.name) && isNoiseFolder(sub.name)))));
    // Folders that keep their name claim it first, so a wrapper never empties into one of them.
    for (const sub of d.dirs) if (!merge(sub)) names.add(sub.name.toLowerCase());
    for (const sub of d.dirs) {
      const inner = merge(sub) && [...sub.items, ...sub.dirs].every((c) => !names.has(c.name.toLowerCase()));
      if (inner) place(sub, dest, label, how);
      else if (isWorkspace(sub) && !verbatim) place(sub, posixJoin(dest, sub.name), sub.name, "workspace");
      else place(sub, posixJoin(dest, sub.name), label, how);
    }
  };

  /** Where a named folder found under clutter goes. `above` are the clutter folders it was buried in. */
  const liftTarget = (d: Dir, above: string[]): string => {
    const name = d.name;
    const w = words(name);
    const area = AREA_WORDS.find(([, re]) => re.test(w));
    let base: string;
    if (area) base = w === area[0].toLowerCase() ? area[0] : `${area[0]}/${name}`;
    else if (FINANCE_NAME.test(w) && d.tally.Code === 0) base = `Finance/${name}`;
    else {
      const a = isWorkspace(d) ? "Code" : mainArea(d);
      const year = a === "Media" && yearIn(name) === null ? yearIn(above.join("/")) : null;
      base = `${a}/${year ? `${name} ${year}` : name}`;
    }
    base = base.split("/").map(sanitizeSegment).join("/");
    // Two rescued folders with the same name merge only when none of their names clash.
    const clash = (dest: string) => {
      const names = claims.get(dest.toLowerCase());
      return names !== undefined && [...d.items, ...d.dirs].some((c) => names.has(c.name.toLowerCase()));
    };
    let dest = base;
    for (let n = 2; clash(dest); n += 1) dest = `${base} (${n})`;
    return dest;
  };

  /** Walks clutter: loose files are left to sort, named folders inside are lifted out. */
  const clutter = (d: Dir, above: string[]) => {
    const top = !d.rel;
    for (const it of d.items) {
      if (it.type !== "unit") continue;
      if (top) {
        claimed("").add(it.name.toLowerCase());
        out.set(it.id, { dest: "", reason: `Project (${it.unitReason ?? "marker found"}) — already at the top, left where it is` });
      } else out.set(it.id, { dest: "Code", reason: `Project folder (${it.unitReason ?? "marker found"}) — rescued from clutter` });
    }
    // A folder right under "Users" is someone's account name, not a topic.
    // An app's own storage ("Resolve Project Backups/<uuid>/…") is one piece too, whatever it's called.
    // "Backups" or "Archive" at the very top is a shelf someone chose, not a pile.
    const named = (sub: Dir) =>
      isWorkspace(sub) ||
      (isNamed(sub.name) && words(d.name) !== "users") ||
      (top && /^(backups?|archives?|archived)$/.test(words(sub.name))) ||
      sub.dirs.some((c) => MACHINE_ID.test(c.name));
    if (top) for (const sub of d.dirs) if (named(sub)) claimed("").add(sub.name.toLowerCase());
    for (const sub of d.dirs) {
      const how = isWorkspace(sub) ? "workspace" : top ? "kept" : "lifted";
      if (top && named(sub)) {
        place(sub, sub.name, sub.name, how);
        continue;
      }
      if (!named(sub)) {
        clutter(sub, top ? above : [...above, sub.name]);
        continue;
      }
      place(sub, liftTarget(sub, above), sub.name, how);
    }
  };

  for (const root of buildTrees(items)) clutter(root, []);
  return out;
}
