import { mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from "../../src/main/engine/settings";

const dir = () => mkdtemp(join(tmpdir(), "fathom-settings-"));

describe("settings", () => {
  it("returns defaults when nothing is saved", async () => {
    expect(await loadSettings(await dir())).toEqual(DEFAULT_SETTINGS);
  });

  it("round-trips saved settings", async () => {
    const d = await dir();
    const s = { ...DEFAULT_SETTINGS, layout: "type" as const, recentRoots: ["D:/Photos"], rules: [{ id: "1", name: "Inv", enabled: true, when: { nameContains: "inv" }, target: "Finance" }] };
    await saveSettings(d, s);
    expect(await loadSettings(d)).toEqual(s);
    expect(JSON.parse(await readFile(join(d, "settings.json"), "utf8")).layout).toBe("type");
  });

  it("falls back to defaults on a corrupt file and keeps a backup", async () => {
    const d = await dir();
    await writeFile(join(d, "settings.json"), "{ nope");
    expect(await loadSettings(d)).toEqual(DEFAULT_SETTINGS);
    expect(await readdir(d)).toContain("settings.json.bak");
  });

  it("fills in fields missing from older files", async () => {
    const d = await dir();
    await writeFile(join(d, "settings.json"), JSON.stringify({ layout: "date" }));
    expect(await loadSettings(d)).toEqual({ ...DEFAULT_SETTINGS, layout: "date" });
  });
});
