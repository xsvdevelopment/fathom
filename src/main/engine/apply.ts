import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, parse, relative } from "node:path";
import type { PlanItem, RunSummary } from "@shared/types";
import { friendlyError } from "./errors";
import { exists, moveEntry, realFs, toLong, type Fs } from "./fsops";
import { JournalWriter } from "./journal";

export type ApplyOptions = {
  runId: string;
  destRoot: string;
  roots: string[];
  dataDir: string;
  fs?: Fs;
  onProgress?: (done: number, total: number, current: string) => void;
  signal?: AbortSignal;
  /** Test hook: throw right after the Nth move, before its "done" record, as if the app crashed. */
  crashAfter?: number;
};

/** Files Windows and macOS drop into folders on their own; they don't make a folder worth keeping. */
export const JUNK = new Set(["desktop.ini", "thumbs.db", "ehthumbs.db", ".ds_store"]);

const key = (p: string) => p.normalize("NFC").toLowerCase();

export function runDir(dataDir: string, runId: string): string {
  return join(dataDir, "runs", runId);
}

/** Creates missing ancestors of `dir` top-down, journaling each before creating it. Returns what it made. */
export async function ensureDir(dir: string, fs: Fs, journal: JournalWriter): Promise<string[]> {
  const missing: string[] = [];
  let cur = dir;
  while (!(await exists(fs, cur))) {
    missing.push(cur);
    const up = dirname(cur);
    if (up === cur) break;
    cur = up;
  }
  const made: string[] = [];
  for (const d of missing.reverse()) {
    await journal.append({ op: "mkdir", path: d }, true);
    await fs.mkdir(toLong(d));
    made.push(d);
  }
  return made;
}

/** Removes folders emptied by the moves, deepest first, never touching roots or non-empty folders. */
export async function removeEmptied(
  sources: string[],
  stopAt: string[],
  fs: Fs,
  journal: JournalWriter,
  junkDir: string,
): Promise<number> {
  const stops = new Set(stopAt.map(key));
  const underStop = (d: string) =>
    stopAt.some((s) => {
      const r = relative(key(s), key(d));
      return r !== "" && !r.startsWith("..") && !parse(r).root;
    });
  const dirs = new Set<string>();
  for (const src of sources) {
    let d = dirname(src);
    while (underStop(d) && !stops.has(key(d))) {
      dirs.add(d);
      d = dirname(d);
    }
  }
  const ordered = [...dirs].sort((a, b) => b.length - a.length);
  let removed = 0;
  let junkN = 0;
  for (const d of ordered) {
    let names: string[];
    try {
      names = await fs.readdir(toLong(d));
    } catch {
      continue;
    }
    if (names.some((n) => !JUNK.has(n.toLowerCase()))) continue;
    try {
      for (const n of names) {
        junkN += 1;
        const to = join(junkDir, String(junkN), n);
        await fs.mkdir(toLong(dirname(to)), { recursive: true });
        await journal.append({ op: "junk", from: join(d, n), to }, true);
        await moveEntry(join(d, n), to, "file", fs);
      }
      await journal.append({ op: "rmdir", path: d }, true);
      await fs.rmdir(toLong(d));
      removed += 1;
    } catch {
      // folder in use or not removable: leaving an empty folder is harmless
    }
  }
  return removed;
}

export type LoopState = { summary: RunSummary; movedFrom: string[] };

async function moveLoop(items: PlanItem[], start: number, opts: ApplyOptions, fs: Fs, journal: JournalWriter, st: LoopState) {
  for (let i = start; i < items.length; i += 1) {
    if (opts.signal?.aborted) {
      st.summary.cancelled = true;
      break;
    }
    const it = items[i]!;
    let made: string[] = [];
    try {
      made = await ensureDir(dirname(it.to), fs, journal);
      await journal.append({ op: "intent", i, from: it.from, to: it.to, type: it.type }, true);
      await moveEntry(it.from, it.to, it.type, fs);
      if (opts.crashAfter === i + 1) throw Object.assign(new Error("Simulated crash"), { simulated: true });
      const stat = await fs.lstat(toLong(it.to));
      await journal.append({ op: "done", i, mtimeMs: stat.mtimeMs, size: stat.size });
      st.summary.moved += 1;
      st.movedFrom.push(it.from);
    } catch (err) {
      if ((err as { simulated?: boolean }).simulated) throw err;
      if ((err as { code?: string }).code === "SOURCE_LEFT") {
        // The copy is in place and the original moved aside; only clearing the leftovers failed.
        const stat = await fs.lstat(toLong(it.to));
        await journal.append({ op: "done", i, mtimeMs: stat.mtimeMs, size: stat.size }, true);
        st.summary.moved += 1;
        st.movedFrom.push(it.from);
        st.summary.failed.push({
          from: it.from,
          to: it.to,
          error: `Moved, but some of the original files couldn't be cleared. They're in ${(err as Error).message}`,
        });
        opts.onProgress?.(i + 1, items.length, it.to);
        continue;
      }
      const error = friendlyError(err);
      // Don't leave behind empty folders that were made only for this item.
      for (const d of [...made].reverse()) await fs.rmdir(toLong(d)).catch(() => {});
      await journal.append({ op: "fail", i, error }, true);
      st.summary.failed.push({ from: it.from, to: it.to, error });
    }
    opts.onProgress?.(i + 1, items.length, it.to);
  }
}

async function finish(opts: ApplyOptions, fs: Fs, journal: JournalWriter, st: LoopState): Promise<RunSummary> {
  st.summary.removedDirs = await removeEmptied(st.movedFrom, opts.roots, fs, journal, join(runDir(opts.dataDir, opts.runId), "junk"));
  await journal.append({ op: "end", at: Date.now(), summary: st.summary }, true);
  return st.summary;
}

/** Executes a preflighted plan with a write-ahead journal so it can always be finished or undone. */
export async function applyPlan(items: PlanItem[], opts: ApplyOptions): Promise<RunSummary> {
  const fs = opts.fs ?? realFs;
  const dir = runDir(opts.dataDir, opts.runId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "plan.json"), JSON.stringify({ destRoot: opts.destRoot, roots: opts.roots, items }));
  const journal = await JournalWriter.open(join(dir, "journal.jsonl"));
  const st: LoopState = { summary: { runId: opts.runId, moved: 0, failed: [], removedDirs: 0, cancelled: false }, movedFrom: [] };
  try {
    await journal.append(
      { op: "start", runId: opts.runId, at: Date.now(), destRoot: opts.destRoot, roots: opts.roots, count: items.length },
      true,
    );
    await moveLoop(items, 0, opts, fs, journal, st);
    return await finish(opts, fs, journal, st);
  } finally {
    await journal.close();
  }
}

/** Continues an interrupted run from `start`, appending to its existing journal. */
export async function resumePlan(items: PlanItem[], start: number, opts: ApplyOptions, st: LoopState): Promise<RunSummary> {
  const fs = opts.fs ?? realFs;
  const journal = await JournalWriter.open(join(runDir(opts.dataDir, opts.runId), "journal.jsonl"));
  try {
    await moveLoop(items, start, opts, fs, journal, st);
    return await finish(opts, fs, journal, st);
  } finally {
    await journal.close();
  }
}
