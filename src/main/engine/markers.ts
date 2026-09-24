/** Files or folders whose presence makes their parent folder a project that must move whole. */
const CHILD_MARKERS: [RegExp, string][] = [
  [/^\.git$/i, "Git repository"],
  [/^\.hg$|^\.svn$/i, "Version-controlled folder"],
  [/^package\.json$/i, "Node project"],
  [/^node_modules$/i, "Node project"],
  [/^cargo\.toml$/i, "Rust project"],
  [/^(pyproject\.toml|setup\.py|requirements\.txt|pipfile)$/i, "Python project"],
  [/^\.venv$|^venv$/i, "Python project"],
  [/^go\.mod$/i, "Go project"],
  [/^(pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?)$/i, "Java project"],
  [/\.(sln|csproj|vbproj|fsproj|vcxproj)$/i, "Visual Studio project"],
  [/\.xcodeproj$|\.xcworkspace$/i, "Xcode project"],
  [/\.uproject$/i, "Unreal project"],
  [/^composer\.json$|^gemfile$/i, "Code project"],
  [/^(gradlew|gradlew\.bat)$/i, "Java project"],
  [/^(cmakelists\.txt|makefile|gnumakefile|meson\.build|build\.ninja|android\.mk|application\.mk)$/i, "Native build project"],
  [/^apktool\.yml$/i, "Decompiled Android app"],
  [/^classes\d*\.dex$|^resources\.arsc$/i, "Unpacked Android app"],
  [/^module\.prop$/i, "Magisk module"],
  [/^(claude|agents|gemini)\.md$/i, "Coding-agent project"],
];

/** Folders that sit beside AndroidManifest.xml in an app, a decompiled app, or a source set. */
const ANDROID_PART = /^(res|smali(_classes\d+)?|lib|assets|java|kotlin|jni|cpp|aidl|original|unknown)$/i;

/** Folder names that are themselves a bundle (a "file" made of a folder). */
const BUNDLE_DIR: [RegExp, string][] = [
  [/\.(app|bundle|framework|plugin|kext)$/i, "App bundle"],
  [/\.(photoslibrary|fcpbundle|lrdata|lrlibrary|musiclibrary|tvlibrary|aplibrary)$/i, "Media library"],
  [/\.(xcodeproj|xcworkspace)$/i, "Xcode project"],
];

/** Folder names that only appear in source code layouts; two together make a source tree. */
const SOURCE_DIRS = new Set(["java", "kotlin", "jni", "cpp", "aidl", "native", "include", "src"]);

/** An Android app's private storage (/data/data/<app>) pulled to disk. */
const APP_DATA_DIRS = new Set(["files", "cache", "code_cache", "shared_prefs", "prefs", "databases", "no_backup"]);

const count = (names: Set<string>, of: Set<string>) => [...of].filter((n) => names.has(n)).length;

/** Folders that hold a project's build file one level down: the project root is their parent. */
export const SOURCE_PART = /^(jni|src|cpp|app|main|native)$/;

const RUNTIME =/\.(exe|dll|pak|dat|bin|json|ini|cfg|xml|manifest|so|pdb|asar|node|lib|config)$/i;

/**
 * An installed or portable program: an .exe beside its .dll files, where most of the folder is runtime
 * files. A Downloads folder that happens to hold one stray .dll next to many documents doesn't qualify.
 */
function isProgramFolder(childNames: string[]): boolean {
  const lower = childNames.map((c) => c.toLowerCase());
  if (!lower.some((c) => c.endsWith(".exe")) || !lower.some((c) => c.endsWith(".dll"))) return false;
  const runtime = lower.filter((c) => RUNTIME.test(c) || !c.includes(".")).length;
  return runtime * 2 >= lower.length;
}

/** Returns why `dirName` (with children `childNames`) must move whole, or null. */
export function unitReason(dirName: string, childNames: string[], extraMarkers: string[] = []): string | null {
  for (const [re, why] of BUNDLE_DIR) if (re.test(dirName)) return why;
  const lower = new Set(childNames.map((c) => c.toLowerCase()));
  if (lower.has("assets") && lower.has("projectsettings")) return "Unity project";
  if (lower.has("androidmanifest.xml") && childNames.some((c) => ANDROID_PART.test(c))) return "Android app";
  if (count(lower, SOURCE_DIRS) >= 2) return "Source tree";
  if (count(lower, APP_DATA_DIRS) >= 2) return "App data";
  const has = (re: RegExp) => [...lower].some((c) => re.test(c));
  if (has(/^readme(\.|$)/) && has(/^(license|licence|copying)(\.|$)/)) return "Code project";
  if (lower.has("dump.cs") && (lower.has("il2cpp.h") || lower.has("script.json") || lower.has("dummydll"))) return "IL2CPP dump";
  for (const name of childNames) {
    for (const [re, why] of CHILD_MARKERS) if (re.test(name)) return why;
  }
  if (isProgramFolder(childNames)) return "Program folder";
  const extras = new Set(extraMarkers.map((m) => m.trim().toLowerCase()).filter(Boolean));
  for (const name of childNames) if (extras.has(name.toLowerCase())) return `Marked by ${name}`;
  return null;
}
