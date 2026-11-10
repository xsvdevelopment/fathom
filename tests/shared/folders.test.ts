import { describe, expect, it } from "vitest";
import { proposeAll } from "@shared/layouts";
import type { Item } from "@shared/types";
import { mk } from "./factory";

const NOW = Date.UTC(2026, 8, 23);
const plan = (items: Item[]) => {
  const p = proposeAll(items, "smart", [], NOW);
  return Object.fromEntries(items.map((i) => [i.rel, p.get(i.id)!.dest]));
};

describe("smart layout, folder first", () => {
  it("never splits a named folder by file type", () => {
    const out = plan([
      mk({ rel: "Stems for Album/Hard to Hold/Remaster 1/Hard to Hold.wav" }),
      mk({ rel: "Stems for Album/Hard to Hold/Remaster 1/Stems V1.zip" }),
      mk({ rel: "Stems for Album/Hard to Hold/Lyrics.txt" }),
      mk({ rel: "LetsTryArt/convert_to_png.py" }),
      mk({ rel: "LetsTryArt/logo_1024.png" }),
      mk({ rel: "LetsTryArt/nul" }),
    ]);
    expect(out["Stems for Album/Hard to Hold/Remaster 1/Hard to Hold.wav"]).toBe("Stems for Album/Hard to Hold/Remaster 1");
    expect(out["Stems for Album/Hard to Hold/Remaster 1/Stems V1.zip"]).toBe("Stems for Album/Hard to Hold/Remaster 1");
    expect(out["Stems for Album/Hard to Hold/Lyrics.txt"]).toBe("Stems for Album/Hard to Hold");
    expect(new Set([out["LetsTryArt/convert_to_png.py"], out["LetsTryArt/logo_1024.png"], out["LetsTryArt/nul"]])).toEqual(
      new Set(["LetsTryArt"]),
    );
  });

  it("still sorts loose files and files in clutter folders", () => {
    const out = plan([mk({ rel: "rufus-4.11.exe" }), mk({ rel: "New folder (2)/PS5215USKIT.pdf" }), mk({ rel: "Sort/create.docx" })]);
    expect(out["rufus-4.11.exe"]).toBe("Inbox/Installers");
    expect(out["New folder (2)/PS5215USKIT.pdf"]).toBe("Documents");
    expect(out["Sort/create.docx"]).toBe("Documents");
  });

  it("lifts a named folder out of clutter whole, to the area its contents belong to", () => {
    const out = plan([
      mk({ rel: "Desktop/New folder/old/Italy 2019/IMG_1.jpg" }),
      mk({ rel: "Desktop/New folder/old/Italy 2019/IMG_2.jpg" }),
      mk({ rel: "Desktop/New folder/old/Italy 2019/notes.txt" }),
      mk({ rel: "Pictures/2019/lisbon/IMG_1.jpg" }),
      mk({ rel: "Documents/Work/Clients/Acme/brief.docx" }),
      mk({ rel: "Documents/Taxes/2018/return.pdf" }),
    ]);
    expect(out["Desktop/New folder/old/Italy 2019/IMG_1.jpg"]).toBe("Media/Italy 2019");
    expect(out["Desktop/New folder/old/Italy 2019/notes.txt"]).toBe("Media/Italy 2019");
    expect(out["Pictures/2019/lisbon/IMG_1.jpg"]).toBe("Media/lisbon 2019");
    expect(out["Documents/Work/Clients/Acme/brief.docx"]).toBe("Work/Clients/Acme");
    expect(out["Documents/Taxes/2018/return.pdf"]).toBe("Finance/Taxes/2018");
  });

  it("drops wrapper folders that say nothing, unless names would clash", () => {
    const out = plan([
      mk({ rel: "Recipes/New folder/untitled folder/pie.pdf" }),
      mk({ rel: "emoji-encoder-main/emoji-encoder-main/index.html" }),
      mk({ rel: "Site/New folder/index.html" }),
      mk({ rel: "Site/index.html" }),
      mk({ rel: "Acme/deliverables/final/use this/logo.png" }),
    ]);
    expect(out["Recipes/New folder/untitled folder/pie.pdf"]).toBe("Recipes");
    expect(out["emoji-encoder-main/emoji-encoder-main/index.html"]).toBe("emoji-encoder-main");
    expect(out["Site/New folder/index.html"]).toBe("Site/New folder");
    expect(out["Acme/deliverables/final/use this/logo.png"]).toBe("Acme/deliverables");
  });

  it("keeps an app's sharded folders apart", () => {
    const out = plan([
      mk({ rel: "Videos/CacheClip/audio/fairlightProfiles/e/FLP_1.pfl" }),
      mk({ rel: "Videos/CacheClip/audio/fairlightProfiles/b/FLP_1.pfl" }),
      mk({ rel: "Videos/CacheClip/audio/fairlightProfiles/b/FLP_2.pfl" }),
      mk({ rel: "Videos/Resolve Project Backups/03ee8c04-09c3-4c9f-860b-6fcb0a8ff23f/Timeline.1" }),
      mk({ rel: "Videos/Resolve Project Backups/0a7dcedf-2754-492e-baba-5cf6286935b5/Timeline.1" }),
    ]);
    expect(out["Videos/CacheClip/audio/fairlightProfiles/e/FLP_1.pfl"]).toBe("Inbox/CacheClip/audio/fairlightProfiles/e");
    expect(out["Videos/CacheClip/audio/fairlightProfiles/b/FLP_1.pfl"]).toBe("Inbox/CacheClip/audio/fairlightProfiles/b");
    expect(out["Videos/Resolve Project Backups/03ee8c04-09c3-4c9f-860b-6fcb0a8ff23f/Timeline.1"]).toBe(
      "Inbox/Resolve Project Backups/03ee8c04-09c3-4c9f-860b-6fcb0a8ff23f",
    );
  });

  it("never files by account name, and leaves a top-level Backups shelf alone", () => {
    const out = plan([
      mk({ rel: "old macbook backup/Users/alex/Desktop/notes.txt" }),
      mk({ rel: "Backups/NSB/refresh.ps1" }),
      mk({ rel: "Backups/NSB/photo.jpg" }),
    ]);
    expect(out["old macbook backup/Users/alex/Desktop/notes.txt"]).toBe("Documents/Notes");
    expect(out["Backups/NSB/refresh.ps1"]).toBe("Backups/NSB");
    expect(out["Backups/NSB/photo.jpg"]).toBe("Backups/NSB");
  });

  it("sorts a dated catch-all folder like any Downloads", () => {
    const out = plan([mk({ rel: "Downloads-2026-09-24/Magisk-v30.6.apk" }), mk({ rel: "Downloads-2026-09-24/nsbforferg/a.mp4" })]);
    expect(out["Downloads-2026-09-24/Magisk-v30.6.apk"]).toBe("Inbox/Installers");
    expect(out["Downloads-2026-09-24/nsbforferg/a.mp4"]).toBe("Media/nsbforferg");
  });

  it("gives two rescued folders with the same name their own place when their files clash", () => {
    const out = plan([mk({ rel: "old/Photos/a.jpg" }), mk({ rel: "stuff/Photos/a.jpg" }), mk({ rel: "misc/Photos/b.jpg" })]);
    expect(new Set([out["old/Photos/a.jpg"], out["stuff/Photos/a.jpg"]])).toEqual(new Set(["Media/Photos", "Media/Photos (2)"]));
  });
});
