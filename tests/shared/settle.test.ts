import { describe, expect, it } from "vitest";
import { buildDemoItems } from "@shared/demo";
import { keeperOrder } from "@shared/keeper";
import { proposeAll } from "@shared/layouts";
import { buildRows } from "@shared/plan";
import type { Item } from "@shared/types";
import { mk } from "./factory";

const NOW = Date.UTC(2026, 8, 23);
const plan = (items: Item[], reassess = false) => {
  const p = proposeAll(items, "smart", [], NOW, { reassess });
  return Object.fromEntries(items.map((i) => [i.rel, p.get(i.id)!.dest]));
};

describe("loose files, settled against the whole plan", () => {
  it("joins a kept folder named in the file's own name", () => {
    const out = plan([
      mk({ rel: "School/Thesis/ch1.docx" }),
      mk({ rel: "Work/Clients/Acme/brief.pdf" }),
      mk({ rel: "Pictures/2019/lisbon/IMG_1.jpg" }),
      mk({ rel: "Downloads/Copy of thesis FINAL.pdf" }),
      mk({ rel: "Downloads/acme-logo.png" }),
      mk({ rel: "Downloads/lisbon sunset.jpg" }),
      mk({ rel: "Downloads/whitepaper.pdf" }),
    ]);
    expect(out["Downloads/Copy of thesis FINAL.pdf"]).toBe("School/Thesis");
    expect(out["Downloads/acme-logo.png"]).toBe("Work/Clients/Acme");
    expect(out["Downloads/lisbon sunset.jpg"]).toBe("Media/lisbon 2019");
    expect(out["Downloads/whitepaper.pdf"]).toBe("Documents");
  });

  it("leaves a firm rule alone even when a folder name matches", () => {
    const out = plan([mk({ rel: "Work/Clients/Acme/brief.pdf" }), mk({ rel: "Downloads/acme tax return 2021.pdf" })]);
    expect(out["Downloads/acme tax return 2021.pdf"]).toBe("Finance/Taxes/2021");
  });

  it("doesn't guess between two folders with the same name", () => {
    const out = plan([
      mk({ rel: "Clients/Acme/Logos/a.png" }),
      mk({ rel: "Clients/Northwind/Logos/b.png" }),
      mk({ rel: "Downloads/logos sheet.png" }),
    ]);
    expect(out["Downloads/logos sheet.png"]).toBe("Media/Images");
  });

  it("uses the person's own folder for an area in place of a second one beside it", () => {
    const out = plan([mk({ rel: "School/Thesis/ch1.docx" }), mk({ rel: "Downloads/essay draft.docx" })]);
    expect(out["Downloads/essay draft.docx"]).toBe("School");
    expect(plan([mk({ rel: "Recipes/pie.pdf" }), mk({ rel: "Downloads/passport.pdf" })])["Downloads/passport.pdf"]).toBe("Personal");
  });

  it("makes year folders only for buckets big enough to need them", () => {
    const photos = (n: number) => Array.from({ length: n }, (_, i) => mk({ rel: `Downloads/IMG_${1000 + i}.jpg` }));
    expect(new Set(Object.values(plan(photos(3))))).toEqual(new Set(["Media/Photos"]));
    expect(new Set(Object.values(plan(photos(12))))).toEqual(new Set(["Media/Photos 2022"]));
    const docs = (n: number) => Array.from({ length: n }, (_, i) => mk({ rel: `Downloads/paper ${i}.pdf` }));
    expect(new Set(Object.values(plan(docs(39))))).toEqual(new Set(["Documents"]));
    expect(new Set(Object.values(plan(docs(40))))).toEqual(new Set(["Documents/2022"]));
  });
});

describe("keeperOrder", () => {
  const first = (...rels: string[]) => rels.map((rel) => mk({ rel })).sort(keeperOrder)[0]!.rel;

  it("keeps the original name over a copy name", () => {
    expect(first("Copy of lease.pdf", "old/stuff/lease.pdf")).toBe("old/stuff/lease.pdf");
    expect(first("Downloads/budget (1).xlsx", "Downloads/budget.xlsx")).toBe("Downloads/budget.xlsx");
  });

  it("keeps the copy someone filed over one lying in a catch-all folder", () => {
    expect(first("Desktop/lease.pdf", "Documents/Personal/Flat/lease.pdf")).toBe("Documents/Personal/Flat/lease.pdf");
  });

  it("falls back to the shallowest copy", () => {
    expect(first("Desktop/old/x.pdf", "Desktop/x.pdf")).toBe("Desktop/x.pdf");
  });
});

describe("re-assess", () => {
  it("changes nothing in a tree it would sort the same way today", () => {
    const items = buildDemoItems();
    const root = items[0]!.root;
    const settle = (list: Item[], reassess: boolean) =>
      buildRows(list, proposeAll(list, "smart", [], NOW, { reassess }), {}, {}, root);
    const once = settle(items, false).map((r) => ({ ...r.item, rel: r.newRel, duplicateOf: undefined }));
    const twice = settle(once, true).map((r) => ({ ...r.item, rel: r.newRel }));
    expect(settle(twice, true).filter((r) => r.moved).map((r) => `${r.item.rel} -> ${r.dest}`)).toEqual([]);
  });

  it("is off by default: Fathom's shelves are folders like any other", () => {
    const out = plan([mk({ rel: "Media/Photos 2024/figma-export.png" }), mk({ rel: "Documents/Scans/scanner manual.pdf" })]);
    expect(out["Media/Photos 2024/figma-export.png"]).toBe("Media/Photos 2024");
    expect(out["Documents/Scans/scanner manual.pdf"]).toBe("Documents/Scans");
  });

  it("files again what an older sort got wrong", () => {
    const out = plan(
      [
        mk({ rel: "Media/Photos 2024/figma-export.png" }),
        mk({ rel: "Documents/Scans/scanner manual.pdf" }),
        mk({ rel: "Documents/Offer_Letter.pdf" }),
        mk({ rel: "Finance/Records/bank-statement-jan.pdf" }),
        mk({ rel: "Studies/thesis FINAL.pdf" }),
        mk({ rel: "School/Thesis/ch1.docx" }),
      ],
      true,
    );
    expect(out["Media/Photos 2024/figma-export.png"]).toBe("Media/Images");
    expect(out["Documents/Scans/scanner manual.pdf"]).toBe("Documents/Manuals");
    expect(out["Documents/Offer_Letter.pdf"]).toBe("Work");
    expect(out["Finance/Records/bank-statement-jan.pdf"]).toBe("Finance/Statements");
    expect(out["Studies/thesis FINAL.pdf"]).toBe("School/Thesis");
    expect(out["School/Thesis/ch1.docx"]).toBe("School/Thesis");
  });

  it("moves a named folder whole to the shelf that fits what it holds, and only then", () => {
    const out = plan(
      [
        mk({ rel: "Documents/Italy 2019/IMG_1.jpg" }),
        mk({ rel: "Documents/Italy 2019/IMG_2.jpg" }),
        mk({ rel: "Documents/Italy 2019/day two/IMG_3.jpg" }),
        mk({ rel: "Documents/Italy 2019/itinerary.pdf" }),
        mk({ rel: "Documents/House move/quote.pdf" }),
        mk({ rel: "Documents/House move/van.jpg" }),
        mk({ rel: "Work/Clients/Acme/moodboard.png" }),
        mk({ rel: "Work/Clients/Acme/logo.png" }),
      ],
      true,
    );
    expect(out["Documents/Italy 2019/IMG_1.jpg"]).toBe("Media/Italy 2019");
    expect(out["Documents/Italy 2019/day two/IMG_3.jpg"]).toBe("Media/Italy 2019/day two");
    expect(out["Documents/Italy 2019/itinerary.pdf"]).toBe("Media/Italy 2019");
    expect(out["Documents/House move/van.jpg"]).toBe("Documents/House move");
    expect(out["Work/Clients/Acme/logo.png"]).toBe("Work/Clients/Acme");
  });

  it("leaves projects and the review folder where they are", () => {
    const out = plan(
      [
        mk({ rel: "Code/harbor-site", type: "unit" }),
        mk({ rel: "Work/tooling", type: "unit" }),
        mk({ rel: "_Fathom Review/Duplicates/lease.pdf" }),
      ],
      true,
    );
    expect(out["Code/harbor-site"]).toBe("Code");
    expect(out["Work/tooling"]).toBe("Work");
    expect(out["_Fathom Review/Duplicates/lease.pdf"]).toBe("_Fathom Review/Duplicates");
  });
});
