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

  it("leaves shortcuts where they are, unless their whole folder moves or a rule says otherwise", () => {
    const lnk = mk({ rel: "Editor.lnk" });
    const url = mk({ rel: "Games/Launcher.url" });
    for (const layout of ["smart", "type", "date"] as const) {
      const out = proposeAll([lnk, url], layout, [], NOW);
      expect(out.get(lnk.id)).toEqual({ dest: "", reason: "Shortcut, left where it is" });
      expect(out.get(url.id)!.dest).toBe("Games");
    }
    // Two shortcuts to the same thing are each where someone wants one.
    const twin = mk({ rel: "Games/Launcher copy.url", duplicateOf: "k" });
    expect(proposeAll([url, twin], "smart", [], NOW).get(twin.id)!.dest).toBe("Games");
    const deep = mk({ rel: "a/b/c/d/Tool.lnk" });
    expect(proposeAll([deep], "flat2", [], NOW).get(deep.id)!.dest).toBe("a/b");
    const r: Rule = { id: "1", name: "Links", enabled: true, when: { exts: ["lnk"] }, target: "Shortcuts" };
    expect(proposeAll([lnk], "smart", [r], NOW).get(lnk.id)!.dest).toBe("Shortcuts");
  });

  it("keeps a saved web page and its _files folder together", () => {
    const page = mk({ rel: "Downloads stuff/Great Recipe.html" });
    const css = mk({ rel: "Downloads stuff/Great Recipe_files/style.css" });
    const img = mk({ rel: "Downloads stuff/Great Recipe_files/img/hero.jpg" });
    const dupe = mk({ rel: "Downloads stuff/Great Recipe_files/jquery.js", duplicateOf: "k" });
    const other = mk({ rel: "Downloads stuff/notes_files/readme.txt" });
    const out = proposeAll([page, css, img, dupe, other], "smart", [], NOW);
    const home = out.get(page.id)!.dest;
    expect(out.get(css.id)).toEqual({ dest: `${home}/Great Recipe_files`, reason: "Kept with the saved page “Great Recipe.html”" });
    expect(out.get(img.id)!.dest).toBe(`${home}/Great Recipe_files/img`);
    expect(out.get(dupe.id)!.dest).toBe(`${home}/Great Recipe_files`);
    expect(out.get(other.id)!.reason).not.toContain("saved page");

    // At the top of a folder the scripts look like a code workspace; they still follow their page.
    const top = mk({ rel: "Article.html" });
    const scripts = ["a.js", "b.js", "c.css"].map((n) => mk({ rel: `Article_files/${n}` }));
    const flat = proposeAll([top, ...scripts], "smart", [], NOW);
    expect(flat.get(top.id)!.dest).toBe("Documents/Web pages");
    for (const s of scripts) expect(flat.get(s.id)!.dest).toBe("Documents/Web pages/Article_files");

    const r: Rule = { id: "1", name: "Styles", enabled: true, when: { exts: ["css"] }, target: "Styles" };
    expect(proposeAll([page, css], "smart", [r], NOW).get(css.id)!.dest).toBe("Styles");
  });

  it("quarantines duplicates under _Fathom Review in every layout but keep, minus the clutter", () => {
    const dup = mk({ rel: "Taxes/old/New folder/x.txt", duplicateOf: "k" });
    for (const layout of ["smart", "type", "date", "flat2"] as const) {
      expect(proposeAll([dup], layout, [], NOW).get(dup.id)!.dest).toBe("_Fathom Review/Duplicates/Taxes");
    }
    expect(proposeAll([dup], "inplace", [], NOW).get(dup.id)!.dest).toBe("Taxes/old/New folder");
  });

  it("keeps units whole: Code in smart layouts, in place when flattening", () => {
    const unit = mk({ rel: "x/y/z/proj", type: "unit" });
    expect(proposeAll([unit], "smart", [], NOW).get(unit.id)!.dest).toBe("Code");
    expect(proposeAll([unit], "flat2", [], NOW).get(unit.id)!.dest).toBe("x/y");
    expect(proposeAll([unit], "inplace", [], NOW).get(unit.id)!.dest).toBe("x/y/z");
  });
});
