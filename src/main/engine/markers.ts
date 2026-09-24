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
];

/** Folder names that are themselves a bundle (a "file" made of a folder). */
const BUNDLE_DIR: [RegExp, string][] = [
  [/\.(app|bundle|framework|plugin|kext)$/i, "App bundle"],
  [/\.(photoslibrary|fcpbundle|lrdata|lrlibrary|musiclibrary|tvlibrary|aplibrary)$/i, "Media library"],
  [/\.(xcodeproj|xcworkspace)$/i, "Xcode project"],
];

const RUNTIME = /\.(exe|dll|pak|dat|bin|json|ini|cfg|xml|manifest|so|pdb|asar|node|lib|config)$/i;

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
  for (const name of childNames) {
    for (const [re, why] of CHILD_MARKERS) if (re.test(name)) return why;
  }
  if (isProgramFolder(childNames)) return "Program folder";
  const extras = new Set(extraMarkers.map((m) => m.trim().toLowerCase()).filter(Boolean));
  for (const name of childNames) if (extras.has(name.toLowerCase())) return `Marked by ${name}`;
  return null;
}
