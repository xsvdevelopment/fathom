import { describe, expect, it } from "vitest";
import { checkRoot } from "../../src/main/engine/guard";
import { makeTree } from "../helpers/fixture";

const DATA = "C:\\Users\\me\\AppData\\Roaming\\Fathom";
const HOME = "C:\\Users\\me";

describe.runIf(process.platform === "win32")("checkRoot", () => {
  it.each([
    ["C:\\Windows", "block"],
    ["C:\\Windows\\System32", "block"],
    ["C:\\Program Files", "block"],
    ["c:\\program files (x86)\\Steam", "block"],
    ["C:\\ProgramData", "block"],
    ["C:\\Users\\me\\AppData\\Local", "block"],
    [DATA, "block"],
    ["C:\\", "warn"],
    ["D:\\", "warn"],
    [HOME, "warn"],
    ["C:\\Users\\me\\Desktop", "ok"],
  ])("%s → %s", async (p, level) => {
    expect((await checkRoot(p, { dataDir: DATA, home: HOME, exists: false })).level).toBe(level);
  });

  it("blocks a folder that is itself a code project", async () => {
    const root = await makeTree({ "package.json": "{}", "src/a.ts": "a" });
    const r = await checkRoot(root, { dataDir: DATA, home: HOME });
    expect(r.level).toBe("block");
    expect(r.message).toMatch(/project/i);
  });

  it("blocks a missing folder", async () => {
    const r = await checkRoot("C:\\definitely\\not\\here\\fathom", { dataDir: DATA, home: HOME });
    expect(r.level).toBe("block");
  });
});
