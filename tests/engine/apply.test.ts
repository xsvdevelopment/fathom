import * as realFs from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyPlan } from "../../src/main/engine/apply";
import type { Fs } from "../../src/main/engine/fsops";
import { readJournal } from "../../src/main/engine/journal";
import { scan } from "../../src/main/engine/scan";
import type { PlanItem } from "@shared/types";
import { makeTree, readTree } from "../helpers/fixture";

export async function setup(spec: Record<string, string | null>, moves: Record<string, string>) {
  const root = await makeTree(spec);
  const dataDir = await mkdtemp(join(tmpdir(), "fathom-data-"));
  const { items } = await scan([root], {});
  const plan: PlanItem[] = Object.entries(moves).map(([from, to]) => {
    const it = items.find((i) => i.rel === from)!;
    return { id: it.id, type: it.type, from: join(root, ...from.split("/")), to: join(root, ...to.split("/")), size: it.size, mtimeMs: it.mtimeMs };
  });
  const opts = { runId: "run1", destRoot: root, roots: [root], dataDir };
  return { root, dataDir, plan, opts };
}

const code = (c: string) => Object.assign(new Error(c), { code: c });

describe("applyPlan", () => {
  it("moves files, removes emptied folders, and journals every step", async () => {
    const { root, dataDir, plan, opts } = await setup(
      { "a/b/c/x.txt": "x", "a/b/y.txt": "y", "keep/z.txt": "z" },
      { "a/b/c/x.txt": "Docs/x.txt", "a/b/y.txt": "Docs/y.txt" },
    );
    const summary = await applyPlan(plan, opts);
    expect(summary).toMatchObject({ runId: "run1", moved: 2, failed: [], removedDirs: 3, cancelled: false });
    expect(await readTree(root)).toEqual({ "Docs/x.txt": "x", "Docs/y.txt": "y", "keep/z.txt": "z" });
    const ops = (await readJournal(join(dataDir, "runs", "run1"))).map((r) => r.op);
    expect(ops).toEqual(["start", "mkdir", "intent", "done", "intent", "done", "rmdir", "rmdir", "rmdir", "end"]);
  });

  it("never removes a root, a folder that still has files, or one left with only junk it can't restore", async () => {
    const { root, plan, opts } = await setup({ "a/x.txt": "x", "a/other.txt": "o" }, { "a/x.txt": "x.txt" });
    await applyPlan(plan, opts);
    expect(await readTree(root)).toEqual({ "a/other.txt": "o", "x.txt": "x" });
  });

  it("clears Windows junk files out of emptied folders so they can be removed", async () => {
    const { root, plan, opts } = await setup({ "a/x.txt": "x", "a/desktop.ini": "j", "a/Thumbs.db": "t" }, { "a/x.txt": "x.txt" });
    const summary = await applyPlan(plan, opts);
    expect(summary.removedDirs).toBe(1);
    expect(await readTree(root)).toEqual({ "x.txt": "x" });
  });

  it("keeps going when a file is in use and reports it", async () => {
    const { root, plan, opts } = await setup({ "a.txt": "a", "b.txt": "b" }, { "a.txt": "D/a.txt", "b.txt": "D/b.txt" });
    const fs: Fs = { ...realFs, rename: (from, to) => (String(from).endsWith("a.txt") ? Promise.reject(code("EBUSY")) : realFs.rename(from, to)) };
    const summary = await applyPlan(plan, { ...opts, fs });
    expect(summary.moved).toBe(1);
    expect(summary.failed).toEqual([expect.objectContaining({ from: join(root, "a.txt"), error: expect.stringMatching(/in use/i) })]);
    expect(await readTree(root)).toEqual({ "D/b.txt": "b", "a.txt": "a" });
  });

  it("copies, verifies, then removes when moving across drives", async () => {
    const { root, plan, opts } = await setup({ "a/x.txt": "cross" }, { "a/x.txt": "D/x.txt" });
    const fs: Fs = { ...realFs, rename: (from, to) => (String(from).includes(".fathom-partial") ? realFs.rename(from, to) : Promise.reject(code("EXDEV"))) };
    const summary = await applyPlan(plan, { ...opts, fs });
    expect(summary.moved).toBe(1);
    expect(await readTree(root)).toEqual({ "D/x.txt": "cross" });
  });

  it("moves a protected project folder whole, across drives too", async () => {
    const { root, plan, opts } = await setup({ "old/proj/.git/HEAD": "h", "old/proj/src/i.ts": "i" }, { "old/proj": "Code/proj" });
    const fs: Fs = { ...realFs, rename: (from, to) => (String(from).includes(".fathom-partial") ? realFs.rename(from, to) : Promise.reject(code("EXDEV"))) };
    await applyPlan(plan, { ...opts, fs });
    expect(await readTree(root)).toEqual({ "Code/proj/.git/HEAD": "h", "Code/proj/src/i.ts": "i" });
  });

  it("refuses to overwrite a file that appeared at the destination after preflight", async () => {
    const { root, plan, opts } = await setup({ "a.txt": "mine", "D/a.txt": "theirs" }, { "a.txt": "D/a.txt" });
    const summary = await applyPlan(plan, opts);
    expect(summary.failed).toHaveLength(1);
    expect(await readTree(root)).toEqual({ "D/a.txt": "theirs", "a.txt": "mine" });
  });

  it("stops cleanly when cancelled", async () => {
    const { plan, opts } = await setup({ "a.txt": "a", "b.txt": "b" }, { "a.txt": "D/a.txt", "b.txt": "D/b.txt" });
    const ac = new AbortController();
    const summary = await applyPlan(plan, { ...opts, signal: ac.signal, onProgress: () => ac.abort() });
    expect(summary.cancelled).toBe(true);
    expect(summary.moved).toBe(1);
  });
});
