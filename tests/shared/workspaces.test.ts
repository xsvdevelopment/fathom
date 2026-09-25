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
      mk({ rel: "reveng/MGN-Build", type: "unit" }),
      mk({ rel: "reveng/analyze_deep.py" }),
      mk({ rel: "reveng/FORENSIC_ANALYSIS.md" }),
      mk({ rel: "reveng/MGSManager_1.0.0.apk" }),
      mk({ rel: "reveng/eli15-guide.md", duplicateOf: "elsewhere" }),
      mk({ rel: "other/photo.jpg" }),
    ]);
    expect(out["reveng/MGN-Build"]).toBe("reveng");
    expect(out["reveng/analyze_deep.py"]).toBe("reveng");
    expect(out["reveng/FORENSIC_ANALYSIS.md"]).toBe("reveng");
    expect(out["reveng/MGSManager_1.0.0.apk"]).toBe("reveng");
    expect(out["reveng/eli15-guide.md"]).toBe("reveng");
  });

  it("never pulls files out of a project's source folders", () => {
    const out = plan([
      mk({ rel: "menufix/build script/LGLModMenu/mod.json" }),
      mk({ rel: "menufix/build script/LGLModMenu/jni/features/FeatureStore.cpp" }),
      mk({ rel: "menufix/build script/LGLModMenu/jni/core/Entry.cpp" }),
      mk({ rel: "menufix/build script/build.bat" }),
    ]);
    expect(out["menufix/build script/LGLModMenu/jni/features/FeatureStore.cpp"]).toBe("menufix/build script/LGLModMenu/jni/features");
    expect(out["menufix/build script/LGLModMenu/jni/core/Entry.cpp"]).toBe("menufix/build script/LGLModMenu/jni/core");
    expect(out["menufix/build script/LGLModMenu/mod.json"]).toBe("menufix/build script/LGLModMenu");
  });

  it("keeps a throwaway-named folder of code together", () => {
    const out = plan([mk({ rel: "qq/ww/ee/ptrace.cpp" }), mk({ rel: "qq/ww/ee/xinj.cpp" }), mk({ rel: "qq/ww/ee/userprefs" })]);
    expect(out["qq/ww/ee/xinj.cpp"]).toBe("qq/ww/ee");
    expect(out["qq/ww/ee/userprefs"]).toBe("qq/ww/ee");
    const copy = plan([mk({ rel: "NewWork - Copy/MGNSuite", type: "unit" }), mk({ rel: "NewWork - Copy/Zygisk-Loader", type: "unit" }), mk({ rel: "NewWork - Copy/z.zip" })]);
    expect(copy["NewWork - Copy/MGNSuite"]).toBe("NewWork - Copy");
    expect(copy["NewWork - Copy/z.zip"]).toBe("NewWork - Copy");
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
      mk({ rel: "MOGO1", type: "unit" }),
      mk({ rel: "ncwd", type: "unit" }),
      mk({ rel: "reveng/a.py" }),
      mk({ rel: "reveng/b.py" }),
      mk({ rel: "Magisk-v30.6.apk" }),
    ]);
    expect(out["MOGO1"]).toBe("");
    expect(out["ncwd"]).toBe("");
    expect(out["Magisk-v30.6.apk"]).toBe("Inbox/Installers");
  });
});
