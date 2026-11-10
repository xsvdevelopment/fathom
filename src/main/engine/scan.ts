import type { Stats } from "node:fs";
import { lstat, opendir, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { kindOf } from "@shared/kinds";
import { extOf } from "@shared/paths";
import type { Item } from "@shared/types";
import { collapseCodeTrees } from "./codetrees";
import { EXIF_EXTS, readTakenDate } from "./exif";
import { itemId } from "./ids";
import { SOURCE_PART, unitReason } from "./markers";

export type ScanProgress = { files: number; dirs: number; bytes: number; current: string };
export type ScanError = { path: string; message: string };
export type ScanResult = { items: Item[]; errors: ScanError[]; roots: string[] };
export type ScanOptions = {
  extraMarkers?: string[];
  extraSkips?: string[];
  onProgress?: (p: ScanProgress) => void;
  signal?: AbortSignal;
  readExif?: boolean;
};

const SKIP_NAMES = new Set([
  "desktop.ini", "thumbs.db", "ehthumbs.db", ".ds_store", "$recycle.bin", "system volume information",
  "appdata", "_fathom review", "icon\r", "pagefile.sys", "hiberfil.sys", "swapfile.sys", "dumpstack.log",
  "dumpstack.log.tmp",
]);

/** A name that asks to be left alone ("Fresh - Do Not Modify", "DONT TOUCH"): never scanned, never moved. */
const HANDS_OFF = /\b(do ?not|don'?t)[ _-]+(modify|touch|move|change|edit|delete|sort)\b/i;

/** Folders that belong to Windows or installed programs; never listed at the top of a root. */
const SYSTEM_TOP = new Set([
  "windows", "program files", "program files (x86)", "programdata", "recovery", "perflogs", "$winreagent",
  "$sysreset", "$windows.~bt", "$windows.~ws", "config.msi", "msocache", "boot", "documents and settings",
  "windowsapps", "wpsystem", "onedrivetemp",
]);

const keyOf = (p: string) => resolve(p).normalize("NFC").toLowerCase().replace(/[\\/]+$/, "");

/** Drops duplicate roots and roots that sit inside another root, so no file is scanned twice. */
export function distinctRoots(roots: string[]): string[] {
  const out: string[] = [];
  for (const r of roots) {
    const k = keyOf(r);
    const covered = out.some((o) => {
      const rel = relative(keyOf(o), k);
      return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
    });
    if (covered) continue;
    for (let i = out.length - 1; i >= 0; i -= 1) {
      const rel = relative(k, keyOf(out[i]!));
      if (!rel.startsWith("..") && !isAbsolute(rel)) out.splice(i, 1);
    }
    out.push(r);
  }
  return out;
}

export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelledError";
  }
}

export { itemId } from "./ids";

function skipMatcher(extra: string[]): (name: string) => boolean {
  const patterns = extra
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => new RegExp(`^${s.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i"));
  return (name) =>
    name.startsWith(".") || name.startsWith("~$") || SKIP_NAMES.has(name.toLowerCase()) || HANDS_OFF.test(name) || patterns.some((p) => p.test(name));
}

/** Code files in a folder and its immediate subfolders ("jni/main.cpp", "jni/features/Settings.cpp"). */
async function codeFilesIn(abs: string, names: string[]): Promise<number> {
  let n = names.filter((c) => kindOf(c) === "code").length;
  for (const sub of names) {
    if (n >= 2) break;
    if (extOf(sub)) continue;
    try {
      n += (await readdir(join(abs, sub))).filter((c) => kindOf(c) === "code").length;
    } catch {
      // a file without an extension, or unreadable
    }
  }
  return n;
}

/**
 * A project whose build file lives in its jni/src/app folder ("MyGame/jni/Android.mk"): the folder
 * holding that source folder is the project root, so the build file and its neighbours stay together.
 */
async function markedBelow(abs: string, children: string[], extraMarkers?: string[]): Promise<string | null> {
  for (const name of children) {
    if (!SOURCE_PART.test(name)) continue;
    try {
      const inside = await readdir(join(abs, name));
      const why = unitReason(name, inside, extraMarkers);
      if (why && why !== "Program folder") return why;
      if (/^(jni|src|cpp)$/.test(name) && (await codeFilesIn(join(abs, name), inside)) >= 2) return "Source tree";
    } catch {
      // not a folder, or unreadable
    }
  }
  return null;
}

/** How many stat calls run at once. One at a time, a project with a node_modules takes minutes to size. */
const STAT_BATCH = 48;
/** How many folders of a unit are read at once while sizing it. */
const DIR_BATCH = 8;

/** Runs `fn` over `list` a batch at a time, results in the same order. */
async function inBatches<T, R>(list: T[], fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < list.length; i += STAT_BATCH) {
    out.push(...(await Promise.all(list.slice(i, i + STAT_BATCH).map(fn))));
  }
  return out;
}

/** Counts files and bytes under a unit folder without following links. Stops counting at `cap` files. */
async function measure(abs: string, cap = 50_000): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  const stack = [abs];
  const one = async (dir: string) => {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    const here: string[] = [];
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) here.push(p);
    }
    files += here.length;
    // An unreadable file inside a unit still moves with it; it just adds nothing to the size.
    const sizes = await inBatches(here, (p) => lstat(p).then((st) => st.size, () => 0));
    for (const n of sizes) bytes += n;
  };
  // A few folders at a time: a dependency tree is thousands of small folders, and one by one is the slow part.
  while (stack.length && files < cap) await Promise.all(stack.splice(-DIR_BATCH).map(one));
  return { files, bytes };
}

/** Walks the roots and returns every file plus every protected unit, never following links. */
export async function scan(roots: string[], opts: ScanOptions): Promise<ScanResult> {
  const skip = skipMatcher(opts.extraSkips ?? []);
  const items: Item[] = [];
  const errors: ScanError[] = [];
  const progress: ScanProgress = { files: 0, dirs: 0, bytes: 0, current: "" };
  let lastTick = 0;
  const tick = (force = false) => {
    const now = Date.now();
    if (!opts.onProgress || (!force && now - lastTick < 250)) return;
    lastTick = now;
    opts.onProgress({ ...progress });
  };
  const checkCancel = () => {
    if (opts.signal?.aborted) throw new CancelledError();
  };

  roots = distinctRoots(roots);
  for (const root of roots) {
    const stack: { abs: string; rel: string }[] = [{ abs: root, rel: "" }];
    while (stack.length) {
      checkCancel();
      const { abs, rel } = stack.pop()!;
      progress.dirs += 1;
      progress.current = abs;
      const names: { name: string; dir: boolean; file: boolean }[] = [];
      try {
        const dir = await opendir(abs);
        for await (const e of dir) {
          if (e.isSymbolicLink()) {
            // Windows reports every reparse point as a link, including OneDrive/cloud placeholders.
            // Only real symlinks and junctions are skipped; lstat tells them apart.
            try {
              const st = await lstat(join(abs, e.name));
              if (st.isSymbolicLink()) continue;
              names.push({ name: e.name, dir: st.isDirectory(), file: st.isFile() });
            } catch {
              // unreadable entry: leave it alone
            }
            continue;
          }
          names.push({ name: e.name, dir: e.isDirectory(), file: e.isFile() });
        }
      } catch (err) {
        errors.push({ path: abs, message: (err as Error).message });
        continue;
      }
      const kept = names.filter((n) => !skip(n.name) && !(rel === "" && n.dir && SYSTEM_TOP.has(n.name.toLowerCase())));

      // Stat this folder's files together; the loop below then reads the answers in order.
      const fileStats = new Map<string, Stats | Error>(
        await inBatches(
          kept.filter((n) => n.file),
          (n): Promise<[string, Stats | Error]> =>
            lstat(join(abs, n.name)).then((st) => [n.name, st], (err: Error) => [n.name, err]),
        ),
      );

      for (const n of kept) {
        const childAbs = join(abs, n.name);
        const childRel = rel ? `${rel}/${n.name}` : n.name;
        if (n.dir) {
          let children: string[];
          try {
            children = await readdir(childAbs);
          } catch (err) {
            errors.push({ path: childAbs, message: (err as Error).message });
            continue;
          }
          const why = unitReason(n.name, children, opts.extraMarkers) ?? (await markedBelow(childAbs, children, opts.extraMarkers));
          if (!why) {
            stack.push({ abs: childAbs, rel: childRel });
            continue;
          }
          try {
            const st = await lstat(childAbs);
            const m = await measure(childAbs);
            items.push({
              id: itemId(root, childRel),
              type: "unit",
              root,
              rel: childRel,
              name: n.name,
              ext: "",
              size: m.bytes,
              mtimeMs: st.mtimeMs,
              birthtimeMs: st.birthtimeMs,
              kind: "other",
              fileCount: m.files,
              unitReason: why,
            });
            progress.files += m.files;
            progress.bytes += m.bytes;
          } catch (err) {
            errors.push({ path: childAbs, message: (err as Error).message });
          }
        } else if (n.file) {
          try {
            const st = fileStats.get(n.name)!;
            if (st instanceof Error) throw st;
            items.push({
              id: itemId(root, childRel),
              type: "file",
              root,
              rel: childRel,
              name: n.name,
              ext: extOf(n.name),
              size: st.size,
              mtimeMs: st.mtimeMs,
              birthtimeMs: st.birthtimeMs,
              kind: kindOf(n.name),
            });
            progress.files += 1;
            progress.bytes += st.size;
          } catch (err) {
            errors.push({ path: childAbs, message: (err as Error).message });
          }
        }
        tick();
      }
    }
  }

  const found = collapseCodeTrees(items);

  if (opts.readExif) {
    const photos = found.filter((i) => i.type === "file" && EXIF_EXTS.has(i.ext));
    let next = 0;
    const worker = async () => {
      while (next < photos.length) {
        checkCancel();
        const it = photos[next++]!;
        const taken = await readTakenDate(join(it.root, ...it.rel.split("/")));
        if (taken) it.takenMs = taken;
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));
  }

  tick(true);
  return { items: found, errors, roots };
}
