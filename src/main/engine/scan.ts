import { createHash } from "node:crypto";
import { lstat, opendir, readdir } from "node:fs/promises";
import { join } from "node:path";
import { kindOf } from "@shared/kinds";
import { extOf } from "@shared/paths";
import type { Item } from "@shared/types";
import { EXIF_EXTS, readTakenDate } from "./exif";
import { unitReason } from "./markers";

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
  "appdata", "_fathom review", "icon\r",
]);

export class CancelledError extends Error {
  constructor() {
    super("Cancelled");
    this.name = "CancelledError";
  }
}

export function itemId(root: string, rel: string): string {
  return createHash("sha1").update(`${root}\0${rel}`).digest("hex").slice(0, 16);
}

function skipMatcher(extra: string[]): (name: string) => boolean {
  const patterns = extra
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => new RegExp(`^${s.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".")}$`, "i"));
  return (name) => name.startsWith(".") || SKIP_NAMES.has(name.toLowerCase()) || patterns.some((p) => p.test(name));
}

/** Counts files and bytes under a unit folder without following links. Stops counting at `cap` files. */
async function measure(abs: string, cap = 50_000): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  const stack = [abs];
  while (stack.length && files < cap) {
    const dir = stack.pop()!;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        files += 1;
        try {
          bytes += (await lstat(p)).size;
        } catch {
          // unreadable file inside a unit: still moves with it
        }
      }
    }
  }
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
          if (e.isSymbolicLink()) continue;
          names.push({ name: e.name, dir: e.isDirectory(), file: e.isFile() });
        }
      } catch (err) {
        errors.push({ path: abs, message: (err as Error).message });
        continue;
      }
      const kept = names.filter((n) => !skip(n.name));

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
          const why = unitReason(n.name, children, opts.extraMarkers);
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
            const st = await lstat(childAbs);
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

  if (opts.readExif) {
    const photos = items.filter((i) => i.type === "file" && EXIF_EXTS.has(i.ext));
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
  return { items, errors, roots };
}
