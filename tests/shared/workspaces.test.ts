import { describe, expect, it } from "vitest";
import { proposeAll } from "@shared/layouts";
import type { Item } from "@shared/types";
import { mk } from "./factory";

const NOW = Date.UTC(2026, 8, 23);
const plan = (items: Item[]) => {
  const p = proposeAll(items, "smart", [], NOW);
  return Object.fromEntries(items.map((i) => [i.rel, p.get(i.id)!.dest]));
};

describe("workspaces", () => {
  it("keeps everything in a work folder together, where it is", () => {
    const out = plan([
      mk({ rel: "sidequest/App-Build", type: "unit" }),
      mk({ rel: "sidequest/analyze_deep.py" }),
      mk({ rel: "sidequest/FINDINGS.md" }),
      mk({ rel: "sidequest/Manager_1.0.0.apk" }),
      mk({ rel: "sidequest/guide.md", duplicateOf: "elsewhere" }),
      mk({ rel: "other/photo.jpg" }),
    ]);
    expect(out["sidequest/App-Build"]).toBe("sidequest");
    expect(out["sidequest/analyze_deep.py"]).toBe("sidequest");
    expect(out["sidequest/FINDINGS.md"]).toBe("sidequest");
    expect(out["sidequest/Manager_1.0.0.apk"]).toBe("sidequest");
    expect(out["sidequest/guide.md"]).toBe("sidequest");
  });

  it("never pulls files out of a project's source folders", () => {
    const out = plan([
      mk({ rel: "gamekit/build script/GameOverlay/mod.json" }),
      mk({ rel: "gamekit/build script/GameOverlay/jni/features/Settings.cpp" }),
      mk({ rel: "gamekit/build script/GameOverlay/jni/core/Entry.cpp" }),
      mk({ rel: "gamekit/build script/build.bat" }),
    ]);
    expect(out["gamekit/build script/GameOverlay/jni/features/Settings.cpp"]).toBe("gamekit/build script/GameOverlay/jni/features");
    expect(out["gamekit/build script/GameOverlay/jni/core/Entry.cpp"]).toBe("gamekit/build script/GameOverlay/jni/core");
    expect(out["gamekit/build script/GameOverlay/mod.json"]).toBe("gamekit/build script/GameOverlay");
  });

  it("keeps a throwaway-named folder of code together", () => {
    const out = plan([mk({ rel: "qq/ww/ee/trace.cpp" }), mk({ rel: "qq/ww/ee/patch.cpp" }), mk({ rel: "qq/ww/ee/userprefs" })]);
    expect(out["qq/ww/ee/patch.cpp"]).toBe("qq/ww/ee");
    expect(out["qq/ww/ee/userprefs"]).toBe("qq/ww/ee");
    const copy = plan([mk({ rel: "Tinkering - Copy/Toolbox", type: "unit" }), mk({ rel: "Tinkering - Copy/Loader", type: "unit" }), mk({ rel: "Tinkering - Copy/z.zip" })]);
    expect(copy["Tinkering - Copy/Toolbox"]).toBe("Tinkering - Copy");
    expect(copy["Tinkering - Copy/z.zip"]).toBe("Tinkering - Copy");
  });

  it("still rescues a lone project buried in noise folders", () => {
    expect(plan([mk({ rel: "New folder/old/my-app", type: "unit" })])["New folder/old/my-app"]).toBe("Code");
  });

  it("still sorts an old machine's dump that happens to hold one project", () => {
    const out = plan([
      mk({ rel: "old laptop/my-app", type: "unit" }),
      mk({ rel: "old laptop/Italy 2019/IMG_1.jpg" }),
      mk({ rel: "old laptop/Italy 2019/IMG_2.jpg" }),
      mk({ rel: "old laptop/tax-return-2019.pdf" }),
    ]);
    expect(out["old laptop/my-app"]).toBe("Code");
    expect(out["old laptop/Italy 2019/IMG_1.jpg"]).toBe("Media/Italy 2019");
    expect(out["old laptop/tax-return-2019.pdf"]).toBe("Finance/Taxes/2019");
  });

  it("never treats Desktop, Downloads or Documents as a workspace", () => {
    const out = plan([mk({ rel: "Downloads/tool.py" }), mk({ rel: "Downloads/x.py" }), mk({ rel: "Downloads/ChromeSetup.exe" })]);
    expect(out["Downloads/ChromeSetup.exe"]).toBe("Inbox/Installers");
  });

  it("leaves top-level projects in place when the whole root is a dev workspace", () => {
    const out = plan([
      mk({ rel: "GAME1", type: "unit" }),
      mk({ rel: "sandbox", type: "unit" }),
      mk({ rel: "sidequest/a.py" }),
      mk({ rel: "sidequest/b.py" }),
      mk({ rel: "Magisk-v30.6.apk" }),
    ]);
    expect(out["GAME1"]).toBe("");
    expect(out["sandbox"]).toBe("");
    expect(out["Magisk-v30.6.apk"]).toBe("Inbox/Installers");
  });
});
