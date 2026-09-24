import { describe, expect, it } from "vitest";
import { collapseCodeTrees } from "../../src/main/engine/codetrees";
import { mk } from "../shared/factory";

const many = (dir: string, n: number, ext: string) => Array.from({ length: n }, (_, i) => mk({ rel: `${dir}/f${i}${ext}`, size: 10 }));

describe("collapseCodeTrees", () => {
  it("turns a folder of nested code with no project marker into one unit", () => {
    const items = [
      ...many("Work/dex-disasm/com/app", 15, ".smali"),
      ...many("Work/dex-disasm/a", 10, ".smali"),
      mk({ rel: "Work/notes.txt" }),
    ];
    const out = collapseCodeTrees(items);
    expect(out.map((i) => i.rel).sort()).toEqual(["Work/dex-disasm", "Work/notes.txt"]);
    expect(out.find((i) => i.rel === "Work/dex-disasm")).toMatchObject({ type: "unit", fileCount: 25, size: 250, name: "dex-disasm" });
  });

  it("swallows units and files inside the code tree", () => {
    const items = [...many("stuff/tree/x", 30, ".java"), mk({ rel: "stuff/tree/lib", type: "unit", fileCount: 400, size: 5 }), mk({ rel: "stuff/budget.docx" })];
    const out = collapseCodeTrees(items);
    expect(out).toHaveLength(2);
    expect(out.find((i) => i.type === "unit")).toMatchObject({ rel: "stuff/tree", fileCount: 430 });
  });

  it("leaves photo, document, and small folders alone", () => {
    const items = [...many("Pictures/Italy", 40, ".jpg"), ...many("Docs/Reports", 40, ".pdf"), ...many("scripts", 12, ".py")];
    expect(collapseCodeTrees(items)).toHaveLength(92);
  });

  it("needs mostly real code, not just unknown files", () => {
    expect(collapseCodeTrees(many("Downloads/misc", 40, ".xyz"))).toHaveLength(40);
  });

  it("does not collapse a mixed folder, but does collapse the code tree inside it", () => {
    const items = [...many("MOGO1/dump/com", 30, ".smali"), ...many("MOGO1", 20, ".txt"), ...many("MOGO1", 10, ".apk")];
    const out = collapseCodeTrees(items);
    expect(out.filter((i) => i.type === "unit").map((i) => i.rel)).toEqual(["MOGO1/dump"]);
    expect(out).toHaveLength(31);
  });

  it("never turns a scanned root itself into a unit", () => {
    expect(collapseCodeTrees(many("", 40, ".ts").map((i) => ({ ...i, rel: i.rel.slice(1) })))).toHaveLength(40);
  });
});
