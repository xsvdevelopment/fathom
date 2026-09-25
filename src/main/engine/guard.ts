import { readdir, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, parse, relative, resolve } from "node:path";
import type { PlanItem, RootCheck } from "@shared/types";
import { unitReason } from "./markers";

export type { RootCheck } from "@shared/types";

const inside = (child: string, parent: string) => {
  const r = relative(parent.toLowerCase(), child.toLowerCase());
  return r === "" || (!!r && !r.startsWith("..") && !parse(r).root);
};

/** Strictly below `parent`, never `parent` itself. */
const below = (child: string, parent: string) => {
  const r = relative(resolve(parent).toLowerCase(), resolve(child).toLowerCase());
  return !!r && !r.startsWith("..") && !isAbsolute(r);
};

/**
 * The first move that reaches outside the scanned folders or the destination, or null when all stay in bounds.
 * The window builds the plan; the main process still checks every path in it before touching the disk.
 */
export function strayMove(items: PlanItem[], roots: string[], destRoot: string): string | null {
  const bad = items.find((i) => !roots.some((r) => below(i.from, r)) || !below(i.to, destRoot));
  return bad ? bad.from : null;
}

export type GuardOptions = { dataDir: string; home: string; exists?: boolean; systemDrive?: string };

const systemDriveOf = (opts: GuardOptions) => (opts.systemDrive ?? process.env.SystemDrive ?? "C:").replace(/[\\/]+$/, "").toLowerCase();

/** Blocks for Windows, program, app-settings and Fathom-data folders; null when none apply. */
function systemBlock(root: string, abs: string, opts: GuardOptions): RootCheck | null {
  const { root: drive } = parse(abs);
  const system = ["Windows", "Program Files", "Program Files (x86)", "ProgramData"].map((d) => resolve(drive, d));
  if (system.some((s) => inside(abs, s))) {
    return { root, level: "block", message: "This is a Windows system folder. Moving files here could break programs." };
  }
  if (inside(abs, resolve(opts.home, "AppData"))) {
    return { root, level: "block", message: "This folder holds app settings. Moving files here could break programs." };
  }
  if (inside(abs, opts.dataDir)) {
    return { root, level: "block", message: "This is where Fathom keeps its own undo history." };
  }
  return null;
}

/** Decides whether a folder is safe to reorganize. */
export async function checkRoot(
  root: string,
  opts: GuardOptions,
): Promise<RootCheck> {
  const abs = resolve(root);
  const { root: drive } = parse(abs);
  const blocked = systemBlock(root, abs, opts);
  if (blocked) return blocked;
  if (abs.replace(/[\\/]+$/, "").toLowerCase() === systemDriveOf(opts)) {
    return { root, level: "block", message: "This is the drive Windows runs from. Pick the folders you want tidied, such as Desktop, Documents, or Downloads." };
  }

  if (opts.exists !== false) {
    try {
      const st = await stat(abs);
      if (!st.isDirectory()) return { root, level: "block", message: "That is a file, not a folder." };
      const why = isHomeOrAbove(abs, opts.home) ? null : unitReason(basename(abs), await readdir(abs));
      if (why) {
        return { root, level: "block", message: `This folder is a ${why.toLowerCase()}. Fathom keeps projects whole, so it won't reorganize inside one.` };
      }
    } catch {
      return { root, level: "block", message: "Fathom can't open this folder. It may have been moved or you may not have access." };
    }
    const above = await projectAt(abs, false, opts.home);
    if (above) {
      return { root, level: "block", message: `This folder is inside a ${above.why.toLowerCase()} (${basename(above.dir)}). Fathom keeps projects whole, so it won't reorganize inside one.` };
    }
  }

  if (abs.toLowerCase() === drive.toLowerCase()) {
    return { root, level: "warn", message: "This is a whole drive. Fathom leaves Windows and program folders alone and keeps program folders whole, but a scan this large can take a while." };
  }
  if (abs.toLowerCase() === resolve(opts.home).toLowerCase()) {
    return { root, level: "warn", message: "This is your whole user folder. Fathom skips app settings, but consider picking Desktop, Documents, or Downloads instead." };
  }
  return { root, level: "ok" };
}

/** The home folder and everything above it hold settings files (CLAUDE.md and the like), never a project. */
function isHomeOrAbove(dir: string, home: string): boolean {
  const rel = relative(resolve(dir).toLowerCase(), resolve(home).toLowerCase());
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

/** The nearest folder at or above `abs` that is a project, and why; null if there is none. */
async function projectAt(abs: string, includeSelf: boolean, home: string): Promise<{ dir: string; why: string } | null> {
  let cur = includeSelf ? abs : dirname(abs);
  if (!includeSelf && cur === abs) return null;
  for (;;) {
    let children: string[] | null = null;
    try {
      children = await readdir(cur);
    } catch {
      // doesn't exist yet (or unreadable): check its parent
    }
    if (isHomeOrAbove(cur, home)) return null;
    if (children) {
      const why = unitReason(basename(cur), children);
      if (why) return { dir: cur, why };
    }
    const up = dirname(cur);
    if (up === cur) return null;
    cur = up;
  }
}

/**
 * Decides whether a folder is safe to put tidied files into. It may not exist yet.
 * Blocks system, app-settings and Fathom-data folders, and anything inside a project (a git repo, etc.).
 */
export async function checkDest(dest: string, opts: GuardOptions): Promise<RootCheck> {
  const abs = resolve(dest);
  const blocked = systemBlock(dest, abs, opts);
  if (blocked) return blocked;
  const project = await projectAt(abs, true, opts.home);
  if (project) {
    return { root: dest, level: "block", message: `That folder is inside a ${project.why.toLowerCase()} (${basename(project.dir)}). Moving files into it could break the project.` };
  }
  return { root: dest, level: "ok" };
}
