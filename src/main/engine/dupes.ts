import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { open } from "node:fs/promises";
import { join } from "node:path";
import type { Item } from "@shared/types";
import { CancelledError } from "./scan";

const MIN_BYTES = 1024;
const HEAD_BYTES = 64 * 1024;

export type DupeOptions = { onProgress?: (done: number, total: number) => void; signal?: AbortSignal };

const absOf = (i: Item) => join(i.root, ...i.rel.split("/"));

async function headHash(abs: string): Promise<string> {
  const fh = await open(abs, "r");
  try {
    const buf = Buffer.alloc(HEAD_BYTES);
    const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0);
    return createHash("sha1").update(buf.subarray(0, bytesRead)).digest("hex");
  } finally {
    await fh.close();
  }
}

export function fullHash(abs: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash("sha1");
    createReadStream(abs)
      .on("data", (chunk) => h.update(chunk))
      .on("error", reject)
      .on("end", () => resolve(h.digest("hex")));
  });
}

function groupBy<T>(list: T[], key: (t: T) => string | undefined): T[][] {
  const m = new Map<string, T[]>();
  for (const t of list) {
    const k = key(t);
    if (k === undefined) continue;
    const g = m.get(k);
    if (g) g.push(t);
    else m.set(k, [t]);
  }
  return [...m.values()].filter((g) => g.length > 1);
}

async function pool<T>(list: T[], n: number, fn: (t: T) => Promise<void>) {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, list.length) }, async () => {
      while (next < list.length) await fn(list[next++]!);
    }),
  );
}

/**
 * Marks exact duplicates: same size → same first 64 KB → same full sha1.
 * The shallowest copy (then the oldest) is kept; the others get `duplicateOf`.
 */
export async function findDuplicates(items: Item[], opts: DupeOptions): Promise<Item[]> {
  const out = items.map((i) => ({ ...i, duplicateOf: undefined, hash: undefined }) as Item);
  const files = out.filter((i) => i.type === "file" && i.size >= MIN_BYTES);
  const bySize = groupBy(files, (i) => String(i.size));
  const candidates = bySize.flat();
  const total = candidates.length;
  let done = 0;
  const bump = () => {
    done += 1;
    opts.onProgress?.(done, total);
  };
  const cancel = () => {
    if (opts.signal?.aborted) throw new CancelledError();
  };

  const heads = new Map<string, string>();
  await pool(candidates, 4, async (i) => {
    cancel();
    try {
      heads.set(i.id, await headHash(absOf(i)));
    } catch {
      // unreadable: can't prove it's a duplicate, so it isn't one
    }
  });

  const fullNeeded = bySize.flatMap((g) => groupBy(g, (i) => heads.get(i.id)).flat());
  const full = new Map<string, string>();
  const fullSet = new Set(fullNeeded.map((i) => i.id));
  for (const i of candidates) if (!fullSet.has(i.id)) bump();
  await pool(fullNeeded, 4, async (i) => {
    cancel();
    try {
      full.set(i.id, await fullHash(absOf(i)));
    } catch {
      // unreadable
    }
    bump();
  });

  const depth = (i: Item) => i.rel.split("/").length;
  for (const group of groupBy(fullNeeded, (i) => full.get(i.id))) {
    group.sort((a, b) => depth(a) - depth(b) || a.mtimeMs - b.mtimeMs || a.rel.localeCompare(b.rel));
    const [keep, ...rest] = group;
    keep!.hash = full.get(keep!.id);
    for (const r of rest) {
      r.hash = keep!.hash;
      r.duplicateOf = keep!.id;
    }
  }
  if (total === 0) opts.onProgress?.(0, 0);
  return out;
}
