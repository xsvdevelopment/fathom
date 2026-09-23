import { describe, expect, it } from "vitest";
import { buildDemoItems } from "@shared/demo";
import { depthStats } from "@shared/tree";

describe("buildDemoItems", () => {
  const items = buildDemoItems();

  it("is a deterministic, 40-deep messy desk", () => {
    expect(items.length).toBeGreaterThan(250);
    expect(depthStats(items.map((i) => i.rel)).maxDepth).toBe(40);
    expect(buildDemoItems().map((i) => i.id)).toEqual(items.map((i) => i.id));
  });

  it("includes protected project folders and exact duplicates", () => {
    expect(items.filter((i) => i.type === "unit").map((i) => i.rel)).toContain("Projects/harbor-site");
    expect(items.some((i) => i.duplicateOf)).toBe(true);
    expect(items.some((i) => i.rel.startsWith("Projects/harbor-site/"))).toBe(false);
  });
});
