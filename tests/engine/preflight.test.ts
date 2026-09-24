import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { preflight } from "../../src/main/engine/preflight";
import { scan } from "../../src/main/engine/scan";
import type { PlanItem } from "@shared/types";
import { makeTree } from "../helpers/fixture";

async function planFor(spec: Record<string, string | null>, moves: Record<string, string>) {
  const root = await makeTree(spec);
  const { items } = await scan([root], {});
  const plan: PlanItem[] = Object.entries(moves).map(([from, to]) => {
    const it = items.find((i) => i.rel === from)!;
    return { id: it.id, type: it.type, from: join(root, from), to: join(root, to), size: it.size, mtimeMs: it.mtimeMs };
  });
  return { root, plan };
}

describe("preflight", () => {
  it("suffixes a destination that already holds an unplanned file", async () => {
    const { root, plan } = await planFor({ "a/x.txt": "new", "Docs/x.txt": "old" }, { "a/x.txt": "Docs/x.txt" });
    const r = await preflight(plan, root);
    expect(r.items[0]!.to).toBe(join(root, "Docs", "x (2).txt"));
    expect(r.issues).toEqual([expect.objectContaining({ code: "collision", level: "warn", id: plan[0]!.id })]);
  });

  it("treats case-only differences as collisions", async () => {
    const { root, plan } = await planFor({ "a/x.txt": "new", "Docs/X.TXT": "old" }, { "a/x.txt": "docs/x.txt" });
    expect((await preflight(plan, root)).items[0]!.to).toBe(join(root, "docs", "x (2).txt"));
  });

  it("suffixes two planned files aiming at the same name", async () => {
    const { root, plan } = await planFor({ "a/x.txt": "1", "b/x.txt": "2" }, { "a/x.txt": "D/x.txt", "b/x.txt": "D/x.txt" });
    const r = await preflight(plan, root);
    expect(r.items.map((i) => i.to)).toEqual([join(root, "D", "x.txt"), join(root, "D", "x (2).txt")]);
  });

  it("drops files that are already where they belong", async () => {
    const { root, plan } = await planFor({ "D/x.txt": "1" }, { "D/x.txt": "D/x.txt" });
    const r = await preflight(plan, root);
    expect(r.items).toEqual([]);
    expect(r.unchanged).toBe(1);
    expect(r.issues).toEqual([]);
  });

  it("keeps a case-only rename of the same file", async () => {
    const { root, plan } = await planFor({ "d/x.txt": "1" }, { "d/x.txt": "d/X.txt" });
    const r = await preflight(plan, root);
    expect(r.items).toHaveLength(1);
    expect(r.items[0]!.to).toBe(join(root, "d", "X.txt"));
  });

  it("skips files that changed or vanished since the scan", async () => {
    const { root, plan } = await planFor({ "a.txt": "1", "b.txt": "2" }, { "a.txt": "D/a.txt", "b.txt": "D/b.txt" });
    await writeFile(join(root, "a.txt"), "changed!");
    plan[1]!.from = join(root, "gone.txt");
    const r = await preflight(plan, root);
    expect(r.items).toEqual([]);
    expect(r.issues.map((i) => i.code).sort()).toEqual(["missing", "stale"]);
  });

  it("refuses to move a folder into itself", async () => {
    const { root, plan } = await planFor({ "p/.git/HEAD": "h" }, { p: "p/Code/p" });
    const r = await preflight(plan, root);
    expect(r.items).toEqual([]);
    expect(r.issues[0]).toMatchObject({ code: "into-itself", level: "error" });
  });

  it("sanitizes nothing it didn't generate: keeps odd but legal names", async () => {
    const { root, plan } = await planFor({ "a/Café 🎉 .txt": "1" }, { "a/Café 🎉 .txt": "D/Café 🎉 .txt" });
    expect((await preflight(plan, root)).items[0]!.to).toBe(join(root, "D", "Café 🎉 .txt"));
  });
});
