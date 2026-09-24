import { randomBytes, randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import type { DupesDone, JobEvent, JobKind, ScanDone } from "@shared/api";
import type { Item, PlanItem, Settings } from "@shared/types";
import { applyPlan, runDir } from "./engine/apply";
import { findDuplicates } from "./engine/dupes";
import { friendlyError } from "./engine/errors";
import { checkDest, checkRoot } from "./engine/guard";
import { preflight } from "./engine/preflight";
import { listRuns } from "./engine/runs";
import { CancelledError, distinctRoots, scan } from "./engine/scan";
import { loadSettings, saveSettings } from "./engine/settings";
import { finishRun, undoRun } from "./engine/undo";

export function dataDir(): string {
  return process.env.FATHOM_DATA_DIR || app.getPath("userData");
}

const jobs = new Map<string, AbortController>();
let lastScan: Item[] = [];
let busyWriting = false;

function send(e: JobEvent) {
  for (const w of BrowserWindow.getAllWindows()) w.webContents.send("fathom:job", e);
}

function startJob<T>(
  kind: JobKind,
  work: (signal: AbortSignal, progress: (p: Omit<Extract<JobEvent, { type: "progress" }>, "jobId" | "kind" | "type">) => void, jobId: string) => Promise<T>,
  opts: { writes?: boolean } = {},
): { jobId: string } {
  if (opts.writes && busyWriting) throw new Error("Fathom is already moving files. Wait for it to finish first.");
  const jobId = randomUUID();
  const ac = new AbortController();
  jobs.set(jobId, ac);
  if (opts.writes) busyWriting = true;
  const progress = (p: Omit<Extract<JobEvent, { type: "progress" }>, "jobId" | "kind" | "type">) =>
    send({ jobId, kind, type: "progress", ...p });
  // Let the invoke() reply reach the window before the first event.
  setImmediate(() => {
    work(ac.signal, progress, jobId)
      .then((result) => send({ jobId, kind, type: "done", result: result as never }))
      .catch((err) =>
        send({
          jobId,
          kind,
          type: "error",
          message: err instanceof CancelledError ? "Cancelled." : friendlyError(err),
          cancelled: err instanceof CancelledError,
        }),
      )
      .finally(() => {
        jobs.delete(jobId);
        if (opts.writes) busyWriting = false;
      });
  });
  return { jobId };
}

const guardOpts = () => ({ dataDir: dataDir(), home: homedir() });

/** Re-checks folders in the main process; the window's word is never taken for it. */
async function allowedRoots(roots: string[]): Promise<string[]> {
  const distinct = distinctRoots(roots);
  const checks = await Promise.all(distinct.map((r) => checkRoot(r, guardOpts())));
  return distinct.filter((_, i) => checks[i]!.level !== "block");
}

async function assertDest(destRoot: string): Promise<void> {
  const c = await checkDest(destRoot, guardOpts());
  if (c.level === "block") throw new Error(c.message ?? "Fathom can't put files there.");
}

function newRunId(): string {
  return `${new Date().toISOString().replace(/[:.]/g, "-")}-${randomBytes(2).toString("hex")}`;
}

export function registerIpc() {
  ipcMain.handle("pickFolders", async (e) => {
    if (process.env.FATHOM_TEST_PICK) return process.env.FATHOM_TEST_PICK.split(";");
    const win = BrowserWindow.fromWebContents(e.sender)!;
    const r = await dialog.showOpenDialog(win, { title: "Choose folders to tidy", properties: ["openDirectory", "multiSelections"] });
    return r.canceled ? [] : r.filePaths;
  });

  ipcMain.handle("pickFolder", async (e) => {
    if (process.env.FATHOM_TEST_PICK) return process.env.FATHOM_TEST_PICK.split(";")[0] ?? null;
    const win = BrowserWindow.fromWebContents(e.sender)!;
    const r = await dialog.showOpenDialog(win, { title: "Choose where the tidy folders go", properties: ["openDirectory", "createDirectory"] });
    return r.canceled ? null : (r.filePaths[0] ?? null);
  });

  ipcMain.handle("checkRoots", async (_e, roots: string[]) => {
    const kept = new Set(distinctRoots(roots));
    return Promise.all(
      roots.map(async (r) => {
        if (!kept.has(r)) return { root: r, level: "block" as const, message: "This folder is already inside another folder you picked, so it's included once." };
        return checkRoot(r, guardOpts());
      }),
    );
  });

  ipcMain.handle("checkDest", (_e, dest: string) => checkDest(dest, guardOpts()));

  ipcMain.handle("scan", async (_e, requested: string[]) => {
    const roots = await allowedRoots(requested);
    if (!roots.length) throw new Error("None of those folders can be scanned safely.");
    const settings = await loadSettings(dataDir());
    return startJob("scan", async (signal, progress, jobId) => {
      const res = await scan(roots, {
        signal,
        readExif: settings.readExif,
        extraSkips: settings.extraSkips,
        extraMarkers: settings.extraMarkers,
        onProgress: (p) => progress(p),
      });
      lastScan = res.items;
      for (let i = 0; i < res.items.length; i += 5000) {
        send({ jobId, kind: "scan", type: "chunk", items: res.items.slice(i, i + 5000) });
      }
      const recent = [...roots, ...settings.recentRoots.filter((r) => !roots.includes(r))].slice(0, 8);
      await saveSettings(dataDir(), { ...(await loadSettings(dataDir())), recentRoots: recent });
      return { errors: res.errors.slice(0, 500), count: res.items.length } satisfies ScanDone;
    });
  });

  ipcMain.handle("findDuplicates", () =>
    startJob("dupes", async (signal, progress) => {
      const out = await findDuplicates(lastScan, { signal, onProgress: (done, total) => progress({ done, total }) });
      lastScan = out;
      return {
        updates: out.filter((i) => i.duplicateOf || i.hash).map((i) => ({ id: i.id, duplicateOf: i.duplicateOf, hash: i.hash })),
      } satisfies DupesDone;
    }),
  );

  ipcMain.handle("cancel", (_e, jobId: string) => {
    jobs.get(jobId)?.abort();
  });

  ipcMain.handle("preflight", async (_e, items: PlanItem[], destRoot: string) => {
    await assertDest(destRoot);
    return preflight(items, destRoot);
  });

  ipcMain.handle("apply", async (_e, items: PlanItem[], destRoot: string, roots: string[]) => {
    await assertDest(destRoot);
    if ((await allowedRoots(roots)).length !== distinctRoots(roots).length) throw new Error("One of the scanned folders is no longer safe to change.");
    const runId = newRunId();
    const job = startJob(
      "apply",
      (signal, progress) =>
        applyPlan(items, { runId, destRoot, roots, dataDir: dataDir(), signal, onProgress: (done, total, current) => progress({ done, total, current }) }),
      { writes: true },
    );
    return { ...job, runId };
  });

  ipcMain.handle("listRuns", () => listRuns(dataDir()));

  ipcMain.handle("undo", (_e, runId: string) =>
    startJob(
      "undo",
      (signal, progress) => undoRun(runId, { dataDir: dataDir(), signal, onProgress: (done, total, current) => progress({ done, total, current }) }),
      { writes: true },
    ),
  );

  ipcMain.handle("finish", (_e, runId: string) =>
    startJob(
      "finish",
      (signal, progress) => finishRun(runId, { dataDir: dataDir(), signal, onProgress: (done, total, current) => progress({ done, total, current }) }),
      { writes: true },
    ),
  );

  ipcMain.handle("loadSettings", () => loadSettings(dataDir()));
  ipcMain.handle("saveSettings", (_e, s: Settings) => saveSettings(dataDir(), s));

  ipcMain.handle("reveal", (_e, p: string) => shell.showItemInFolder(p));
  ipcMain.handle("openPath", async (_e, p: string) => {
    await shell.openPath(p);
  });
  ipcMain.handle("runFolder", async (_e, runId: string) => {
    await shell.openPath(runDir(dataDir(), runId));
  });

  ipcMain.handle("exportCsv", async (e, csv: string, suggestedName: string) => {
    const win = BrowserWindow.fromWebContents(e.sender)!;
    const r = await dialog.showSaveDialog(win, {
      title: "Export plan",
      defaultPath: join(app.getPath("documents"), suggestedName),
      filters: [{ name: "CSV", extensions: ["csv"] }],
    });
    if (r.canceled || !r.filePath) return null;
    await writeFile(r.filePath, `﻿${csv}`, "utf8");
    return r.filePath;
  });
}
