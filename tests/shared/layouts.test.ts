import { describe, expect, it } from "vitest";
import { proposeAll } from "@shared/layouts";
import type { Rule } from "@shared/types";
import { mk } from "./factory";

const NOW = Date.UTC(2026, 8, 23);

describe("proposeAll", () => {
  const file = mk({ rel: "a/Invoice-7.pdf", mtimeMs: Date.UTC(2022, 0, 2), birthtimeMs: Date.UTC(2022, 0, 2) });

  it("applies enabled user rules first", () => {
    const r: Rule = { id: "1", name: "Invoices", enabled: true, when: { nameContains: "invoice" }, target: "Finance/Invoices/{year}" };
    const p = proposeAll([file], "smart", [r], NOW).get(file.id)!;
    expect(p.dest).toBe("Finance/Invoices/2022");
    expect(p.reason).toBe("Rule: Invoices");
    expect(proposeAll([file], "smart", [{ ...r, enabled: false }], NOW).get(file.id)!.dest).not.toBe("Finance/Invoices/2022");
  });

  it("supports type, date, flatten and keep layouts", () => {
    expect(proposeAll([file], "type", [], NOW).get(file.id)!.dest).toBe("Documents/2022");
    expect(proposeAll([file], "date", [], NOW).get(file.id)!.dest).toBe("2022/01");
    const deep = mk({ rel: "a/b/c/d/x.txt" });
    expect(proposeAll([deep], "flat2", [], NOW).get(deep.id)!.dest).toBe("a/b");
    expect(proposeAll([deep], "flat3", [], NOW).get(deep.id)!.dest).toBe("a/b/c");
    expect(proposeAll([deep], "inplace", [], NOW).get(deep.id)!.dest).toBe("a/b/c/d");
  });

  it("quarantines duplicates under _Fathom Review in every layout but keep", () => {
    const dup = mk({ rel: "a/b/x.txt", duplicateOf: "k" });
    for (const layout of ["smart", "type", "date", "flat2"] as const) {
      expect(proposeAll([dup], layout, [], NOW).get(dup.id)!.dest).toBe("_Fathom Review/Duplicates/a/b");
    }
    expect(proposeAll([dup], "inplace", [], NOW).get(dup.id)!.dest).toBe("a/b");
  });

  it("keeps units whole: Code in smart layouts, in place when flattening", () => {
    const unit = mk({ rel: "x/y/z/proj", type: "unit" });
    expect(proposeAll([unit], "smart", [], NOW).get(unit.id)!.dest).toBe("Code");
    expect(proposeAll([unit], "flat2", [], NOW).get(unit.id)!.dest).toBe("x/y");
    expect(proposeAll([unit], "inplace", [], NOW).get(unit.id)!.dest).toBe("x/y/z");
  });
});
