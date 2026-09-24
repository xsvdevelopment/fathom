import { mkdir, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readTakenDate } from "../../src/main/engine/exif";
import { scan } from "../../src/main/engine/scan";
import { makeTree } from "../helpers/fixture";

/** Minimal JPEG whose EXIF DateTimeOriginal is `date` ("YYYY:MM:DD HH:MM:SS"). */
function jpegWithDate(date: string): Buffer {
  const tiff = Buffer.alloc(64);
  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8); // IFD0: one entry
  tiff.writeUInt16LE(0x8769, 10); // ExifIFD pointer
  tiff.writeUInt16LE(4, 12);
  tiff.writeUInt32LE(1, 14);
  tiff.writeUInt32LE(26, 18);
  tiff.writeUInt32LE(0, 22);
  tiff.writeUInt16LE(1, 26); // ExifIFD: one entry
  tiff.writeUInt16LE(0x9003, 28); // DateTimeOriginal
  tiff.writeUInt16LE(2, 30);
  tiff.writeUInt32LE(20, 32);
  tiff.writeUInt32LE(44, 36);
  tiff.writeUInt32LE(0, 40);
  tiff.write(`${date}\0`, 44, "ascii");
  const app1Body = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
  const len = Buffer.alloc(2);
  len.writeUInt16BE(app1Body.length + 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), len, app1Body, Buffer.from([0xff, 0xd9])]);
}

describe("scan", () => {
  it("lists files, keeps project folders whole, and skips junk", async () => {
    const root = await makeTree({
      "a/b/c/x.txt": "x",
      "proj/.git/HEAD": "ref",
      "proj/src/i.ts": "code",
      "node/package.json": "{}",
      "node/node_modules/z/i.js": "js",
      "Game/Assets/a.png": "p",
      "Game/ProjectSettings/ProjectVersion.txt": "u",
      "desktop.ini": "junk",
      "Thumbs.db": "junk",
      ".hidden": "h",
      "_Fathom Review/Duplicates/q.txt": "q",
      "empty": null,
    });
    const { items, errors } = await scan([root], {});
    expect(errors).toEqual([]);
    const byRel = new Map(items.map((i) => [i.rel, i]));
    expect([...byRel.keys()].sort()).toEqual(["Game", "a/b/c/x.txt", "node", "proj"]);
    expect(byRel.get("proj")).toMatchObject({ type: "unit", unitReason: "Git repository", fileCount: 2 });
    expect(byRel.get("node")).toMatchObject({ type: "unit", fileCount: 2 });
    expect(byRel.get("Game")).toMatchObject({ type: "unit", unitReason: "Unity project" });
    const x = byRel.get("a/b/c/x.txt")!;
    expect(x).toMatchObject({ type: "file", root, name: "x.txt", ext: ".txt", size: 1, kind: "document" });
    expect(x.id).toMatch(/^[0-9a-f]{16}$/);
  });

  it("treats bundles like .app folders as units and honors extra skips and markers", async () => {
    const root = await makeTree({
      "Tools/Thing.app/Contents/x": "x",
      "keep/me.txt": "m",
      "skipme/a.txt": "a",
      "Site/.projectroot": "",
      "Site/index.html": "<p>",
    });
    const { items } = await scan([root], { extraSkips: ["skipme"], extraMarkers: [".projectroot"] });
    expect(items.map((i) => i.rel).sort()).toEqual(["Site", "Tools/Thing.app", "keep/me.txt"]);
  });

  it("never follows symlinks", async () => {
    const root = await makeTree({ "real/a.txt": "a" });
    const outside = await makeTree({ "secret.txt": "s" });
    try {
      await symlink(outside, join(root, "link"), "junction");
    } catch {
      return; // no permission to create links on this machine
    }
    const { items } = await scan([root], {});
    expect(items.map((i) => i.rel)).toEqual(["real/a.txt"]);
  });

  it("scans several roots and reports progress", async () => {
    const r1 = await makeTree({ "a.txt": "a" });
    const r2 = await makeTree({ "b/b.txt": "b" });
    const seen: number[] = [];
    const { items, roots } = await scan([r1, r2], { onProgress: (p) => seen.push(p.files) });
    expect(roots).toEqual([r1, r2]);
    expect(items.map((i) => `${i.root === r1 ? 1 : 2}:${i.rel}`).sort()).toEqual(["1:a.txt", "2:b/b.txt"]);
    expect(seen.at(-1)).toBe(2);
  });

  it("stops when cancelled", async () => {
    const root = await makeTree({ "a/a.txt": "a", "b/b.txt": "b" });
    const ac = new AbortController();
    ac.abort();
    await expect(scan([root], { signal: ac.signal })).rejects.toThrow(/cancel/i);
  });

  it("reads photo capture dates", async () => {
    const root = await makeTree({});
    await writeFile(join(root, "p.jpg"), jpegWithDate("2021:06:01 12:00:00"));
    await writeFile(join(root, "broken.jpg"), "not a jpeg");
    expect(new Date((await readTakenDate(join(root, "p.jpg")))!).getFullYear()).toBe(2021);
    expect(await readTakenDate(join(root, "broken.jpg"))).toBeUndefined();
    const { items } = await scan([root], { readExif: true });
    expect(items.find((i) => i.name === "p.jpg")!.takenMs).toBeGreaterThan(0);
  });

  it("scans 10,000 files in a few seconds", async () => {
    const root = await makeTree({});
    for (let d = 0; d < 100; d += 1) {
      const dir = join(root, `d${d}`, "x", "y");
      await mkdir(dir, { recursive: true });
      await Promise.all(Array.from({ length: 100 }, (_, f) => writeFile(join(dir, `f${f}.txt`), "z")));
    }
    const t = performance.now();
    const { items } = await scan([root], {});
    expect(items).toHaveLength(10_000);
    expect(performance.now() - t).toBeLessThan(5000);
  }, 120_000);

  it("never lists system folders or swap files at the top of a root", async () => {
    const root = await makeTree({
      "Windows/System32/drivers/x.sys": "s",
      "Program Files/App/app.exe": "e",
      "Program Files (x86)/Old/old.exe": "e",
      "ProgramData/Vendor/cfg.ini": "c",
      "Recovery/r.txt": "r",
      "PerfLogs/p.txt": "p",
      "pagefile.sys": "p",
      "hiberfil.sys": "h",
      "Keep/me.txt": "m",
    });
    const { items } = await scan([root], {});
    expect(items.map((i) => i.rel)).toEqual(["Keep/me.txt"]);
  });

  it("keeps program folders (an .exe with its .dll files) whole", async () => {
    const root = await makeTree({ "Tools/App/app.exe": "e", "Tools/App/core.dll": "d", "Tools/App/data/x.pak": "x", "Tools/putty.exe": "p" });
    const { items } = await scan([root], {});
    const byRel = new Map(items.map((i) => [i.rel, i]));
    expect(byRel.get("Tools/App")).toMatchObject({ type: "unit", unitReason: "Program folder", fileCount: 3 });
    expect(byRel.get("Tools/putty.exe")?.type).toBe("file");
  });

  it("scans each file once when roots overlap", async () => {
    const root = await makeTree({ "a.txt": "a", "sub/b.txt": "b" });
    const { items, roots } = await scan([root, join(root, "sub"), root.toUpperCase()], {});
    expect(roots).toEqual([root]);
    expect(items.map((i) => i.rel).sort()).toEqual(["a.txt", "sub/b.txt"]);
  });
});
