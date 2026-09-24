import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { JournalRecord, PlanItem, RunInfo } from "@shared/types";
import { runDir } from "./apply";
import { readJournal, readJournalFile } from "./journal";

export type RunPlan = { destRoot: string; roots: string[]; items: PlanItem[] };

export async function readPlan(dataDir: string, runId: string): Promise<RunPlan> {
  return JSON.parse(await readFile(join(runDir(dataDir, runId), "plan.json"), "utf8")) as RunPlan;
}

export const readUndoJournal = (dataDir: string, runId: string) =>
  readJournalFile(join(runDir(dataDir, runId), "undo.jsonl"));

function infoFrom(runId: string, recs: JournalRecord[], undo: JournalRecord[]): RunInfo | null {
  const start = recs.find((r) => r.op === "start");
  if (!start || start.op !== "start") return null;
  const undoEnd = undo.find((r) => r.op === "end");
  const status: RunInfo["status"] = undoEnd
    ? "undone"
    : undo.length
      ? "partially-undone"
      : recs.some((r) => r.op === "end")
        ? "applied"
        : "incomplete";
  return {
    runId,
    at: start.at,
    destRoot: start.destRoot,
    roots: start.roots,
    count: start.count,
    moved: recs.filter((r) => r.op === "done").length,
    failed: recs.filter((r) => r.op === "fail").length,
    status,
    undoneAt: undoEnd && undoEnd.op === "end" ? undoEnd.at : undefined,
  };
}

/** Every run on record, newest first. */
export async function listRuns(dataDir: string): Promise<RunInfo[]> {
  let ids: string[];
  try {
    ids = await readdir(join(dataDir, "runs"));
  } catch {
    return [];
  }
  const out: RunInfo[] = [];
  for (const id of ids) {
    const info = infoFrom(id, await readJournal(runDir(dataDir, id)), await readUndoJournal(dataDir, id));
    if (info) out.push(info);
  }
  return out.sort((a, b) => b.at - a.at);
}

/** Runs that stopped part-way (crash or power loss) and need finishing or rolling back. */
export async function incompleteRuns(dataDir: string): Promise<RunInfo[]> {
  return (await listRuns(dataDir)).filter((r) => r.status === "incomplete" || r.status === "partially-undone");
}
