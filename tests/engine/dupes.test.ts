import { utimes } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { findDuplicates } from "../../src/main/engine/dupes";
import { scan } from "../../src/main/engine/scan";
import { makeTree } from "../helpers/fixture";

const big = (c: string, n = 5000) => c.repeat(n);

async function scanned(spec: Record<string, string | null>) {
  const root = await makeTree(spec);
  const { items } = await scan([root], {});
  return { root, items };
}

describe("findDuplicates", () => {
  it("keeps the shallowest copy and marks the rest", async () => {
    const { items } = await scanned({ "a.txt": big("x"), "d/e/a.txt": big("x"), "d/e/f/g/copy.txt": big("x"), "other.txt": big("y") });
    const out = await findDuplicates(items, {});
    const byRel = new Map(out.map((i) => [i.rel, i]));
    const keep = byRel.get("a.txt")!;
    expect(keep.duplicateOf).toBeUndefined();
    expect(byRel.get("d/e/a.txt")!.duplicateOf).toBe(keep.id);
    expect(byRel.get("d/e/f/g/copy.txt")!.duplicateOf).toBe(keep.id);
    expect(byRel.get("other.txt")!.duplicateOf).toBeUndefined();
    expect(keep.hash).toMatch(/^[0-9a-f]{40}$/);
  });

  it("ignores same-size files with different content and tiny files", async () => {
    const { items } = await scanned({ "a.txt": big("x"), "b.txt": big("y"), "t1.txt": "hi", "t2.txt": "hi" });
    expect((await findDuplicates(items, {})).filter((i) => i.duplicateOf)).toEqual([]);
  });

  it("compares whole files, not just the first 64 KB", async () => {
    const head = "h".repeat(70_000);
    const { items } = await scanned({ "a.bin": `${head}A`, "b.bin": `${head}B` });
    expect((await findDuplicates(items, {})).filter((i) => i.duplicateOf)).toEqual([]);
  });

  it("breaks depth ties by keeping the older file", async () => {
    const { root } = await scanned({ "x/new.txt": big("z"), "y/old.txt": big("z") });
    await utimes(join(root, "y", "old.txt"), new Date(2015, 0, 1), new Date(2015, 0, 1));
    const { items } = await scan([root], {});
    const out = await findDuplicates(items, {});
    expect(out.find((i) => i.name === "new.txt")!.duplicateOf).toBe(out.find((i) => i.name === "old.txt")!.id);
  });

  it("leaves protected units alone and reports progress", async () => {
    const { items } = await scanned({ "p/.git/HEAD": big("q"), "q.txt": big("q"), "r.txt": big("q") });
    const ticks: number[] = [];
    const out = await findDuplicates(items, { onProgress: (done) => ticks.push(done) });
    expect(out.find((i) => i.rel === "p")!.duplicateOf).toBeUndefined();
    expect(out.filter((i) => i.duplicateOf)).toHaveLength(1);
    expect(ticks.length).toBeGreaterThan(0);
  });
});
