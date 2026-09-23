import { describe, expect, it } from "vitest";
import { kindOf } from "@shared/kinds";

describe("kindOf", () => {
  it.each([
    ["a.PPTX", "presentation"], ["setup.msi", "installer"], ["x.ttf", "font"], ["book.epub", "ebook"],
    ["noext", "other"], ["data.json", "data"], ["a.pdf", "document"], ["b.xlsx", "spreadsheet"],
    ["c.HEIC", "image"], ["d.mkv", "video"], ["e.flac", "audio"], ["f.tsx", "code"], ["g.7z", "archive"],
    ["h.psd", "design"],
  ])("%s → %s", (name, kind) => expect(kindOf(name)).toBe(kind));
});
