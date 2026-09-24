import { describe, expect, it } from "vitest";
import { buildRows, joinAbs, planCsv, toPlanItems } from "@shared/plan";
import type { Proposal } from "@shared/types";
import { mk } from "./factory";

const ROOT = "C:\\Users\\me\\Desktop";

describe("joinAbs", () => {
  it("joins with the root's own separator", () => {
    expect(joinAbs("C:\\a\\", "x/y.txt")).toBe("C:\\a\\x\\y.txt");
    expect(joinAbs("/home/a", "x/y.txt")).toBe("/home/a/x/y.txt");
    expect(joinAbs("D:\\", "y.txt")).toBe("D:\\y.txt");
  });
});

describe("buildRows", () => {
  const a = mk({ rel: "old/stuff/a.pdf", root: ROOT });
  const b = mk({ rel: "Docs/b.pdf", root: ROOT });
  const c = mk({ rel: "x/c.pdf", root: ROOT });
  const proposals = new Map<string, Proposal>([
    [a.id, { dest: "Documents", reason: "Loose document" }],
    [b.id, { dest: "Docs", reason: "Kept" }],
    [c.id, { dest: "Documents", reason: "Loose document" }],
  ]);

  it("uses proposals, pins overrides, and marks what moves", () => {
    const rows = buildRows([a, b, c], proposals, { [c.id]: "Work/Acme" }, {}, ROOT);
    expect(rows.map((r) => [r.newRel, r.moved, r.pinned])).toEqual([
      ["Documents/a.pdf", true, false],
      ["Docs/b.pdf", false, false],
      ["Work/Acme/c.pdf", true, true],
    ]);
    expect(rows[2]!.reason).toBe("Placed by you");
  });

  it("keeps excluded items where they are", () => {
    const rows = buildRows([a], proposals, {}, { [a.id]: true }, ROOT);
    expect(rows[0]).toMatchObject({ newRel: "old/stuff/a.pdf", moved: false, excluded: true });
  });

  it("counts everything as moving when the destination is another folder", () => {
    const rows = buildRows([b], proposals, {}, {}, "E:\\Tidy");
    expect(rows[0]!.moved).toBe(true);
  });
});

describe("toPlanItems", () => {
  it("emits absolute moves only for items that move", () => {
    const a = mk({ rel: "old/a.pdf", root: ROOT, size: 7, mtimeMs: 42 });
    const b = mk({ rel: "Docs/b.pdf", root: ROOT });
    const rows = buildRows([a, b], new Map([[a.id, { dest: "Documents", reason: "" }], [b.id, { dest: "Docs", reason: "" }]]), {}, {}, ROOT);
    expect(toPlanItems(rows, ROOT)).toEqual([
      { id: a.id, type: "file", from: `${ROOT}\\old\\a.pdf`, to: `${ROOT}\\Documents\\a.pdf`, size: 7, mtimeMs: 42 },
    ]);
  });
});

describe("planCsv", () => {
  it("writes a header and escapes quotes and commas", () => {
    const a = mk({ rel: 'x/say "hi", ok.txt', root: ROOT });
    const rows = buildRows([a], new Map([[a.id, { dest: "Documents", reason: "Loose, document" }]]), {}, {}, ROOT);
    const csv = planCsv(rows, ROOT).split("\n");
    expect(csv[0]).toBe("name,from,to,reason,size_bytes,moves");
    expect(csv[1]).toContain('"say ""hi"", ok.txt"');
    expect(csv[1]).toContain('"Loose, document"');
  });
});

describe("names with leading spaces", () => {
  it("keeps them exactly, so Keep in place never moves anything", () => {
    const a = mk({ rel: " Old/ notes.txt", root: ROOT });
    const rows = buildRows([a], new Map([[a.id, { dest: " Old", reason: "Kept in place" }]]), {}, {}, ROOT);
    expect(rows[0]).toMatchObject({ newRel: " Old/ notes.txt", moved: false });
  });
});
