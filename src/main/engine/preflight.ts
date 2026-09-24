import { statfs } from "node:fs/promises";
import { basename, dirname, extname, join, parse, relative } from "node:path";
import type { PlanItem, PreflightIssue, PreflightResult } from "@shared/types";
import { exists, realFs, toLong, type Fs } from "./fsops";

const key = (p: string) => p.normalize("NFC").toLowerCase();
const isInside = (child: string, parent: string) => {
  const r = relative(key(parent), key(child));
  return r !== "" && !r.startsWith("..") && !parse(r).root;
};

function withSuffix(to: string, n: number): string {
  const ext = extname(to);
  const stem = basename(to, ext);
  return join(dirname(to), `${stem} (${n})${ext}`);
}

/**
 * Checks a plan against the disk right before applying it. Returns the items that are safe to move
 * (collisions renamed with " (n)", no-ops and stale/missing sources dropped) and what it found.
 */
export async function preflight(items: PlanItem[], destRoot: string, fs: Fs = realFs): Promise<PreflightResult> {
  const issues: PreflightIssue[] = [];
  const kept: PlanItem[] = [];
  const claimed = new Set<string>();
  let unchanged = 0;

  try {
    await fs.mkdir(toLong(destRoot), { recursive: true });
    const probe = join(destRoot, `.fathom-write-test-${process.pid}`);
    const fh = await fs.open(toLong(probe), "wx");
    await fh.close();
    await fs.unlink(toLong(probe));
  } catch {
    issues.push({ level: "error", code: "no-write", message: `Fathom can't write to ${destRoot}. Check that the drive is connected and you have permission.` });
  }

  for (const item of items) {
    if (item.from === item.to) {
      unchanged += 1;
      continue;
    }
    if (item.type === "unit" && isInside(item.to, item.from)) {
      issues.push({ id: item.id, level: "error", code: "into-itself", message: `${basename(item.from)} can't be moved inside itself, so it stays put.` });
      continue;
    }
    let st;
    try {
      st = await fs.lstat(toLong(item.from));
    } catch {
      issues.push({ id: item.id, level: "warn", code: "missing", message: `${basename(item.from)} is no longer there, so it was skipped.` });
      continue;
    }
    if (item.type === "file" && (st.size !== item.size || Math.abs(st.mtimeMs - item.mtimeMs) > 2)) {
      issues.push({ id: item.id, level: "warn", code: "stale", message: `${basename(item.from)} changed after the scan, so it was skipped. Scan again to include it.` });
      continue;
    }
    if (basename(item.to).length > 255 || item.to.length > 32_000) {
      issues.push({ id: item.id, level: "warn", code: "path-too-long", message: `The new path for ${basename(item.from)} is too long for Windows, so it was skipped.` });
      continue;
    }

    const caseOnly = key(item.from) === key(item.to);
    let to = item.to;
    let n = 1;
    while (claimed.has(key(to)) || (!caseOnly && (await exists(fs, to)))) {
      n += 1;
      to = withSuffix(item.to, n);
    }
    if (n > 1) {
      issues.push({ id: item.id, level: "warn", code: "collision", message: `${basename(item.to)} already exists there, so this one will be named ${basename(to)}.` });
    }
    claimed.add(key(to));
    kept.push({ ...item, to });
  }

  const crossBytes = kept
    .filter((i) => parse(i.from).root.toLowerCase() !== parse(i.to).root.toLowerCase())
    .reduce((s, i) => s + i.size, 0);
  if (crossBytes > 0) {
    try {
      const s = await statfs(destRoot);
      if (s.bavail * s.bsize < crossBytes * 1.05) {
        issues.push({ level: "error", code: "space", message: "There isn't enough free space on the destination drive for the files being copied from another drive." });
      }
    } catch {
      // can't measure free space; the copy will fail safely if it runs out
    }
  }

  return { items: kept, issues, unchanged };
}
