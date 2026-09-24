import { describe, expect, it } from "vitest";
import { isNoiseFolder } from "@shared/noise";

describe("isNoiseFolder", () => {
  it.each([
    "New folder", "New folder (3)", "untitled folder", "stuff", "Misc", "old", "Backup", "temp",
    "final", "FINAL FINAL", "Copy of Desktop", "v2", "2019", "12", "Desktop", "Documents",
    "Downloads", "a", "aaaaaaa", "___", "do not delete", "use this", "New Folder (2)", "deliverables", "Q3", "iPhone Backup",
    "old macbook backup", "drafts", "round-4", "me", "the", "why", "inside", "really",
  ])("treats %s as noise", (n) => expect(isNoiseFolder(n)).toBe(true));

  it.each(["Acme", "Italy 2019", "Thesis", "Taxes", "Harbor Studio", "Recipes", "Q3 Report", "Wedding"])(
    "keeps %s as meaningful",
    (n) => expect(isNoiseFolder(n)).toBe(false),
  );
});
