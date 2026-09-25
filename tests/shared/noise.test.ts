import { describe, expect, it } from "vitest";
import { isBlankFolder, isNoiseFolder } from "@shared/noise";

describe("isNoiseFolder", () => {
  it.each([
    "New folder", "New folder (3)", "untitled folder", "stuff", "Misc", "old", "Backup", "temp",
    "final", "FINAL FINAL", "Copy of Desktop", "v2", "2019", "12", "Desktop", "Documents",
    "Downloads", "a", "aaaaaaa", "___", "do not delete", "use this", "New Folder (2)", "deliverables", "Q3", "iPhone Backup",
    "old macbook backup", "drafts", "round-4", "me", "the", "why", "inside", "really", "old laptop", "Dad's PC",
    "Downloads-2026-09-24", "Desktop (2)", "qq",
  ])("treats %s as noise", (n) => expect(isNoiseFolder(n)).toBe(true));

  it.each(["Acme", "Italy 2019", "Thesis", "Taxes", "Harbor Studio", "Recipes", "Q3 Report", "Wedding"])(
    "keeps %s as meaningful",
    (n) => expect(isNoiseFolder(n)).toBe(false),
  );
});

describe("isBlankFolder", () => {
  it.each(["New folder", "New folder (2)", "untitled folder", "untitled 3", "why", "aaaa", "___"])("%s says nothing", (n) =>
    expect(isBlankFolder(n)).toBe(true),
  );
  it.each(["old", "v2", "2019", "final", "Acme", "e", "1", "0f"])("%s still tells siblings apart", (n) =>
    expect(isBlankFolder(n)).toBe(false),
  );
});
