import { basename, dirname, extname, join } from "node:path";
import type { JournalRecord, RunSummary, UndoSummary } from "@shared/types";
import { resumePlan, runDir, type LoopState } from "./apply";
import { friendlyError } from "./errors";
import { exists, moveEntry, realFs, toLong, type Fs } from "./fsops";
import { JournalWriter, readJournal } from "./journal";
import { readPlan, readUndoJournal } from "./runs";

export type UndoOptions = {
  dataDir: string;
  fs?: Fs;
  onProgress?: (done: number, total: number, current: string) => void;
  signal?: AbortSignal;
};

type Move = { i: number; from: string; to: string; type: "file" | "unit"; done?: { mtimeMs: number; size: number } };

/** Resolves each intent to whether its move happened, checking the disk when the journal can't say. */
async function resolveMoves(recs: JournalRecord[], fs: Fs): Promise<Move[]> {
  const moves = new Map<number, Move>();
  const failed = new Set<number>();
  for (const r of recs) {
    if (r.op === "intent") moves.set(r.i, { i: r.i, from: r.from, to: r.to, type: r.type });
    else if (r.op === "done") {
      const m = moves.get(r.i);
      if (m) m.done = { mtimeMs: r.mtimeMs, size: r.size };
    } else if (r.op === "fail") failed.add(r.i);
  }
  const out: Move[] = [];
  for (const m of moves.values()) {
    if (failed.has(m.i)) continue;
    if (!m.done && !((await exists(fs, m.to)) && !(await exists(fs, m.from)))) continue;
    out.push(m);
  }
  return out;
}

function restoredName(path: string): string {
  const ext = extname(path);
  return join(dirname(path), `${basename(path, ext)} (restored)${ext}`);
}

/** Puts everything from a run back where it was. Works on finished and interrupted runs alike. */
export async function undoRun(runId: string, opts: UndoOptions): Promise<UndoSummary> {
  const fs = opts.fs ?? realFs;
  const dir = runDir(opts.dataDir, runId);
  const recs = await readJournal(dir);
  if (!recs.length) throw new Error("That run has no record, so it can't be undone.");
  const prior = await readUndoJournal(opts.dataDir, runId);
  if (prior.some((r) => r.op === "end")) throw new Error("This run was already undone.");
  const alreadyRestored = new Set(prior.flatMap((r) => (r.op === "done" ? [r.i] : [])));

  const journal = await JournalWriter.open(join(dir, "undo.jsonl"));
  const result: UndoSummary = { restored: 0, skipped: [] };
  try {
    if (!prior.length) await journal.append({ op: "start", runId, at: Date.now(), destRoot: "", roots: [], count: 0 }, true);

    // 1. Recreate folders the run removed (deepest were removed first, so recreate in reverse).
    for (const r of [...recs].reverse()) {
      if (r.op === "rmdir") await fs.mkdir(toLong(r.path), { recursive: true });
    }
    // 2. Put back junk files that were cleared out of those folders.
    for (const r of [...recs].reverse()) {
      if (r.op === "junk" && (await exists(fs, r.to)) && !(await exists(fs, r.from))) {
        await moveEntry(r.to, r.from, "file", fs).catch(() => {});
      }
    }
    // 3. Reverse the moves, newest first.
    const moves = (await resolveMoves(recs, fs)).reverse();
    let n = 0;
    for (const m of moves) {
      if (opts.signal?.aborted) break;
      n += 1;
      if (alreadyRestored.has(m.i)) continue;
      try {
        if (!(await exists(fs, m.to))) {
          result.skipped.push({ path: m.to, reason: "It's no longer where Fathom put it, so there was nothing to move back." });
          await journal.append({ op: "fail", i: m.i, error: "missing" }, true);
          continue;
        }
        if (m.type === "file" && m.done) {
          const st = await fs.lstat(toLong(m.to));
          if (st.size !== m.done.size || Math.abs(st.mtimeMs - m.done.mtimeMs) > 2) {
            result.skipped.push({ path: m.to, reason: "It changed after Fathom moved it, so it was left where it is." });
            await journal.append({ op: "fail", i: m.i, error: "changed" }, true);
            continue;
          }
        }
        const target = (await exists(fs, m.from)) ? restoredName(m.from) : m.from;
        await fs.mkdir(toLong(dirname(target)), { recursive: true });
        await journal.append({ op: "intent", i: m.i, from: m.to, to: target, type: m.type }, true);
        await moveEntry(m.to, target, m.type, fs);
        await journal.append({ op: "done", i: m.i, mtimeMs: 0, size: 0 });
        result.restored += 1;
      } catch (err) {
        result.skipped.push({ path: m.to, reason: friendlyError(err) });
        await journal.append({ op: "fail", i: m.i, error: friendlyError(err) }, true);
      }
      opts.onProgress?.(n, moves.length, m.from);
    }
    if (opts.signal?.aborted) return result;

    // 4. Remove folders the run created, if they're empty now.
    for (const r of [...recs].reverse()) {
      if (r.op === "mkdir") await fs.rmdir(toLong(r.path)).catch(() => {});
    }
    const summary: RunSummary = { runId, moved: result.restored, failed: [], removedDirs: 0, cancelled: false };
    await journal.append({ op: "end", at: Date.now(), summary }, true);
    return result;
  } finally {
    await journal.close();
  }
}

/** Completes a run that was interrupted part-way, from the first move without a result. */
export async function finishRun(runId: string, opts: UndoOptions): Promise<RunSummary> {
  const fs = opts.fs ?? realFs;
  const recs = await readJournal(runDir(opts.dataDir, runId));
  if (recs.some((r) => r.op === "end")) throw new Error("This run already finished.");
  const plan = await readPlan(opts.dataDir, runId);

  const settled = await resolveMoves(recs, fs);
  const settledIdx = new Set(settled.map((m) => m.i));
  const failedIdx = new Set(recs.flatMap((r) => (r.op === "fail" ? [r.i] : [])));
  const lastTouched = Math.max(-1, ...recs.flatMap((r) => (r.op === "intent" ? [r.i] : [])));

  const st: LoopState = {
    summary: {
      runId,
      moved: settled.length,
      failed: recs.flatMap((r) => (r.op === "fail" ? [{ from: plan.items[r.i]!.from, to: plan.items[r.i]!.to, error: r.error }] : [])),
      removedDirs: 0,
      cancelled: false,
    },
    movedFrom: settled.map((m) => m.from),
  };

  // An intent whose move happened but whose "done" never got written: record it now.
  const journal = await JournalWriter.open(join(runDir(opts.dataDir, runId), "journal.jsonl"));
  try {
    for (const m of settled) {
      if (m.done) continue;
      const s = await fs.lstat(toLong(m.to));
      await journal.append({ op: "done", i: m.i, mtimeMs: s.mtimeMs, size: s.size }, true);
    }
  } finally {
    await journal.close();
  }

  // Resume at the first item that neither moved nor failed.
  let start = 0;
  while (start < plan.items.length && start <= lastTouched && (settledIdx.has(start) || failedIdx.has(start))) start += 1;
  return resumePlan(plan.items, start, { runId, destRoot: plan.destRoot, roots: plan.roots, dataDir: opts.dataDir, fs, onProgress: opts.onProgress, signal: opts.signal }, st);
}
