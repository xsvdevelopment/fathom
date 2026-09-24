import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { applyPlan } from "../../src/main/engine/apply";
import { listRuns } from "../../src/main/engine/runs";
import { scan } from "../../src/main/engine/scan";
import { finishRun, undoRun } from "../../src/main/engine/undo";
import type { PlanItem } from "@shared/types";
import { makeTree, readTree } from "../helpers/fixture";

const ORIGINAL = {
  "a/b/c/x.txt": "x",
  "a/b/y.txt": "y",
  "a/desktop.ini": "junk",
  "keep/z.txt": "z",
  "old/proj/.git/HEAD": "h",
};
const MOVES = { "a/b/c/x.txt": "Docs/x.txt", "a/b/y.txt": "Docs/y.txt", "old/proj": "Code/proj" };
const APPLIED = { "Code/proj/.git/HEAD": "h", "Docs/x.txt": "x", "Docs/y.txt": "y", "keep/z.txt": "z" };

async function setup(runId = "r1") {
  const root = await makeTree(ORIGINAL);
  const dataDir = await mkdtemp(join(tmpdir(), "fathom-data-"));
  const { items } = await scan([root], {});
  const plan: PlanItem[] = Object.entries(MOVES).map(([from, to]) => {
    const it = items.find((i) => i.rel === from)!;
    return { id: it.id, type: it.type, from: join(root, ...from.split("/")), to: join(root, ...to.split("/")), size: it.size, mtimeMs: it.mtimeMs };
  });
  return { root, dataDir, plan, opts: { runId, destRoot: root, roots: [root], dataDir } };
}

describe("undoRun", () => {
  it("restores the original tree exactly, including removed folders and junk files", async () => {
    const { root, dataDir, plan, opts } = await setup();
    await applyPlan(plan, opts);
    expect(await readTree(root)).toEqual(APPLIED);
    const res = await undoRun("r1", { dataDir });
    expect(res).toEqual({ restored: 3, skipped: [] });
    expect(await readTree(root)).toEqual(ORIGINAL);
  });

  it("leaves a file alone if it was edited after the run", async () => {
    const { root, dataDir, plan, opts } = await setup();
    await applyPlan(plan, opts);
    await writeFile(join(root, "Docs", "x.txt"), "edited later");
    const res = await undoRun("r1", { dataDir });
    expect(res.restored).toBe(2);
    expect(res.skipped).toEqual([{ path: join(root, "Docs", "x.txt"), reason: expect.stringMatching(/changed/i) }]);
    expect((await readTree(root))["Docs/x.txt"]).toBe("edited later");
  });

  it("restores beside a file that now occupies the original spot", async () => {
    const { root, dataDir, plan, opts } = await setup();
    await applyPlan(plan, opts);
    await writeFile(join(root, "keep", "placeholder.txt"), "p");
    await makeTreeAt(root, { "a/b/y.txt": "someone else" });
    await undoRun("r1", { dataDir });
    const tree = await readTree(root);
    expect(tree["a/b/y.txt"]).toBe("someone else");
    expect(tree["a/b/y (restored).txt"]).toBe("y");
  });

  it("can only undo a run once", async () => {
    const { dataDir, plan, opts } = await setup();
    await applyPlan(plan, opts);
    await undoRun("r1", { dataDir });
    await expect(undoRun("r1", { dataDir })).rejects.toThrow(/already undone/i);
  });
});

describe("undo after a case-only folder change", () => {
  it("puts files back without adding (restored)", async () => {
    const root = await makeTree({ "work/notes.txt": "n", "work/Acme/brief.pdf": "b" });
    const dataDir = await mkdtemp(join(tmpdir(), "fathom-data-"));
    const { items } = await scan([root], {});
    const plan: PlanItem[] = items.map((it) => ({
      id: it.id, type: it.type, from: join(root, ...it.rel.split("/")), to: join(root, "Work", ...it.rel.split("/").slice(1)), size: it.size, mtimeMs: it.mtimeMs,
    }));
    await applyPlan(plan, { runId: "c1", destRoot: root, roots: [root], dataDir });
    await undoRun("c1", { dataDir });
    const names = Object.keys(await readTree(root)).map((k) => k.toLowerCase()).sort();
    expect(names).toEqual(["work/acme/brief.pdf", "work/notes.txt"]);
  });
});

describe("crash recovery", () => {
  it("finishes a run that crashed mid-way", async () => {
    const { root, dataDir, plan, opts } = await setup();
    await expect(applyPlan(plan, { ...opts, crashAfter: 2 })).rejects.toThrow(/crash/i);
    expect((await listRuns(dataDir))[0]!.status).toBe("incomplete");
    const summary = await finishRun("r1", { dataDir });
    expect(summary.moved).toBe(3);
    expect(await readTree(root)).toEqual(APPLIED);
    expect((await listRuns(dataDir))[0]!.status).toBe("applied");
  });

  it("rolls back a run that crashed mid-way", async () => {
    const { root, dataDir, plan, opts } = await setup();
    await expect(applyPlan(plan, { ...opts, crashAfter: 2 })).rejects.toThrow(/crash/i);
    await undoRun("r1", { dataDir });
    expect(await readTree(root)).toEqual(ORIGINAL);
    expect((await listRuns(dataDir))[0]!.status).toBe("undone");
  });

  it("handles an intent whose move never happened", async () => {
    const { root, dataDir, plan, opts } = await setup();
    await expect(applyPlan(plan, { ...opts, crashAfter: 1 })).rejects.toThrow();
    // Simulate "crashed before the move": put the first file back where it came from.
    const { rename } = await import("node:fs/promises");
    await rename(plan[0]!.to, plan[0]!.from);
    const summary = await finishRun("r1", { dataDir });
    expect(summary.moved).toBe(3);
    expect(await readTree(root)).toEqual(APPLIED);
  });
});

describe("listRuns", () => {
  it("lists runs newest first with counts and status", async () => {
    const { dataDir, plan, opts } = await setup("older");
    await applyPlan(plan, opts);
    const second = await setup("newer");
    await applyPlan(second.plan, { ...second.opts, dataDir });
    const runs = await listRuns(dataDir);
    expect(runs.map((r) => r.runId)).toEqual(["newer", "older"]);
    expect(runs[0]).toMatchObject({ moved: 3, failed: 0, count: 3, status: "applied" });
  });
});

async function makeTreeAt(root: string, spec: Record<string, string>) {
  const { mkdir } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  for (const [rel, content] of Object.entries(spec)) {
    const abs = join(root, ...rel.split("/"));
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, content);
  }
}
