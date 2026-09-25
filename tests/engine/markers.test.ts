import { describe, expect, it } from "vitest";
import { unitReason } from "../../src/main/engine/markers";

describe("unitReason", () => {
  it.each([
    ["apktool output", ["AndroidManifest.xml", "apktool.yml", "smali", "smali_classes2", "res", "original", "lib", "assets"]],
    ["apktool output without a manifest", ["apktool.yml", "smali", "res"]],
    ["an unpacked APK", ["AndroidManifest.xml", "classes.dex", "classes2.dex", "resources.arsc", "lib", "META-INF"]],
    ["a dex dump on its own", ["classes.dex", "classes2.dex"]],
    ["an Android source set", ["AndroidManifest.xml", "java", "res"]],
    ["a Magisk module", ["module.prop", "customize.sh", "zygisk"]],
    ["a CMake project", ["CMakeLists.txt", "src", "include"]],
    ["an ndk-build folder", ["Android.mk", "Application.mk", "main.cpp"]],
    ["a make project", ["Makefile", "main.c"]],
    ["a Gradle wrapper project", ["gradlew", "gradlew.bat", "app"]],
    ["a source tree with no build file", ["ELI5.md", "java", "native", "aidl", "scripts"]],
    ["a pulled app data folder", ["files", "cache", "com.app-dump.cs"]],
    ["saved app data", ["prefs", "files", "databases"]],
    ["a coding-agent workspace", ["CLAUDE.md", "Client side", "Server side", "START_HERE.md"]],
    ["an agents workspace", ["AGENTS.md", "Toolbox", "notes.md"]],
    ["a downloaded repository", ["README.md", "LICENSE", "ccswitch.sh"]],
    ["an IL2CPP dump", ["dump.cs", "il2cpp.h", "script.json", "DummyDll"]],
  ])("keeps %s whole", (_, children) => {
    expect(unitReason("folder", children)).not.toBeNull();
  });

  it.each([
    ["a manifest next to documents", ["AndroidManifest.xml", "notes.txt", "photo.jpg"]],
    ["a dump.cs among work notes", ["dump.cs", "notes.md", "log1.txt", "build.apk"]],
    ["plain folders", ["res", "lib", "assets"]],
    ["a readme among photos", ["README.txt", "IMG_1.jpg", "IMG_2.jpg"]],
    ["one source-like folder among others", ["src", "Photos", "Taxes"]],
  ])("does not treat %s as a project", (_, children) => {
    expect(unitReason("folder", children)).toBeNull();
  });
});
