import { describe, expect, it } from "vitest";
import { expandTemplate, matchRule } from "@shared/rules";
import type { Rule } from "@shared/types";
import { mk } from "./factory";

const NOW = Date.UTC(2026, 8, 23);
const rule = (when: Rule["when"], target = "X"): Rule => ({ id: "r", name: "r", enabled: true, when, target });

describe("matchRule", () => {
  it("matches name, glob, extension, path, kind and size", () => {
    const item = mk({ rel: "Work/Acme/Invoice-7.PDF", size: 5000 });
    expect(matchRule(item, rule({ nameContains: "invoice" }), NOW)).toBe(true);
    expect(matchRule(item, rule({ glob: "invoice-*.pdf" }), NOW)).toBe(true);
    expect(matchRule(item, rule({ glob: "receipt*" }), NOW)).toBe(false);
    expect(matchRule(item, rule({ exts: ["pdf"] }), NOW)).toBe(true);
    expect(matchRule(item, rule({ exts: [".docx"] }), NOW)).toBe(false);
    expect(matchRule(item, rule({ pathContains: "acme" }), NOW)).toBe(true);
    expect(matchRule(item, rule({ kind: "document" }), NOW)).toBe(true);
    expect(matchRule(item, rule({ minBytes: 6000 }), NOW)).toBe(false);
    expect(matchRule(item, rule({ maxBytes: 6000 }), NOW)).toBe(true);
  });

  it("requires every condition and ignores empty rules", () => {
    const item = mk({ rel: "a/Invoice.pdf" });
    expect(matchRule(item, rule({ nameContains: "invoice", exts: ["docx"] }), NOW)).toBe(false);
    expect(matchRule(item, rule({}), NOW)).toBe(false);
  });

  it("matches age by item date", () => {
    const old = mk({ rel: "a.txt", mtimeMs: Date.UTC(2020, 0, 1), birthtimeMs: Date.UTC(2020, 0, 1) });
    expect(matchRule(old, rule({ olderThanDays: 365 }), NOW)).toBe(true);
    expect(matchRule(old, rule({ newerThanDays: 365 }), NOW)).toBe(false);
  });

  it("never applies to protected units", () => {
    expect(matchRule(mk({ rel: "proj", type: "unit" }), rule({ nameContains: "proj" }), NOW)).toBe(false);
  });
});

describe("expandTemplate", () => {
  it("fills tokens and sanitizes segments", () => {
    const item = mk({ rel: "Clients/Acme/Invoice.pdf", mtimeMs: Date.UTC(2022, 2, 5), birthtimeMs: Date.UTC(2022, 2, 5) });
    expect(expandTemplate("Finance/{parent}/{year}-{month}/{kind}/{ext}", item)).toBe("Finance/Acme/2022-03/Documents/pdf");
    expect(expandTemplate("A:B/../C", item)).toBe("A_B/C");
  });
});
