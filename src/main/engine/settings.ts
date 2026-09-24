import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Settings } from "@shared/types";

export const DEFAULT_SETTINGS: Settings = {
  rules: [],
  layout: "smart",
  findDuplicates: true,
  readExif: true,
  extraSkips: [],
  extraMarkers: [],
  recentRoots: [],
};

const file = (dataDir: string) => join(dataDir, "settings.json");

/** Loads settings; missing fields get defaults, a corrupt file is set aside as settings.json.bak. */
export async function loadSettings(dataDir: string): Promise<Settings> {
  let text: string;
  try {
    text = await readFile(file(dataDir), "utf8");
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
  try {
    const parsed = JSON.parse(text) as Partial<Settings>;
    return { ...structuredClone(DEFAULT_SETTINGS), ...parsed };
  } catch {
    await rename(file(dataDir), `${file(dataDir)}.bak`).catch(() => {});
    return structuredClone(DEFAULT_SETTINGS);
  }
}

/** Saves atomically: write a temp file, then rename over the old one. */
export async function saveSettings(dataDir: string, s: Settings): Promise<void> {
  await mkdir(dataDir, { recursive: true });
  const tmp = `${file(dataDir)}.tmp`;
  await writeFile(tmp, JSON.stringify(s, null, 2));
  await rename(tmp, file(dataDir));
}
