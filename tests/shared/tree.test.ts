import { describe, expect, it } from "vitest";
import { buildTree, depthStats } from "@shared/tree";

describe("buildTree", () => {
  it("nests entries, sorts dirs first, and rolls up counts", () => {
    const root = buildTree([
      { id: "1", path: "b.txt", size: 1 },
      { id: "2", path: "A/x.txt", size: 2 },
      { id: "3", path: "A/B/y.txt", size: 3 },
    ]);
    expect(root.children.map((c) => c.name)).toEqual(["A", "b.txt"]);
    const a = root.children[0]!;
    expect(a.fileCount).toBe(2);
    expect(a.totalBytes).toBe(5);
    expect(a.maxDepth).toBe(2);
    expect(a.children[0]!.path).toBe("A/B");
  });
});

describe("depthStats", () => {
  it("counts files by folder depth", () => {
    const s = depthStats(["a.txt", "x/b.txt", "x/y/z/c.txt"]);
    expect(s.maxDepth).toBe(3);
    expect(s.byDepth).toEqual([1, 1, 0, 1]);
    expect(s.deepestPath).toBe("x/y/z/c.txt");
  });
});
