import { describe, expect, it } from "vitest";
import { basename, caseKey, depthOf, extOf, parentPath, posixJoin, sanitizeSegment } from "@shared/paths";

describe("paths", () => {
  it("joins and splits posix paths", () => {
    expect(posixJoin("a/", "/b", "", "c")).toBe("a/b/c");
    expect(parentPath("a/b/c.txt")).toBe("a/b");
    expect(parentPath("c.txt")).toBe("");
    expect(basename("a/b/c.txt")).toBe("c.txt");
    expect(extOf("Photo.JPG")).toBe(".jpg");
    expect(extOf(".bashrc")).toBe("");
    expect(depthOf("a/b/c.txt")).toBe(3);
  });

  it("sanitizes Windows-hostile folder names", () => {
    expect(sanitizeSegment('a<b>:c?.')).toBe("a_b__c_");
    expect(sanitizeSegment("a\\b|c")).toBe("a_b_c");
    expect(sanitizeSegment("CON")).toBe("_CON");
    expect(sanitizeSegment("lpt3")).toBe("_lpt3");
    expect(sanitizeSegment("  ")).toBe("Untitled");
    expect(sanitizeSegment("report. ")).toBe("report");
    expect(sanitizeSegment("Italy 2019")).toBe("Italy 2019");
  });

  it("compares paths case-insensitively", () => {
    expect(caseKey("Report.PDF")).toBe(caseKey("report.pdf"));
    expect(caseKey("Café")).toBe(caseKey("Cafe\u0301"));
  });
});
