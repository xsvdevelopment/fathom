import { readdir, stat } from "node:fs/promises";
import { basename, parse, relative, resolve } from "node:path";
import { unitReason } from "./markers";

export type RootCheck = { root: string; level: "ok" | "warn" | "block"; message?: string };

const inside = (child: string, parent: string) => {
  const r = relative(parent.toLowerCase(), child.toLowerCase());
  return r === "" || (!!r && !r.startsWith("..") && !parse(r).root);
};

/** Decides whether a folder is safe to reorganize. */
export async function checkRoot(
  root: string,
  opts: { dataDir: string; home: string; exists?: boolean },
): Promise<RootCheck> {
  const abs = resolve(root);
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

  if (opts.exists !== false) {
    try {
      const st = await stat(abs);
      if (!st.isDirectory()) return { root, level: "block", message: "That is a file, not a folder." };
      const why = unitReason(basename(abs), await readdir(abs));
      if (why) {
        return { root, level: "block", message: `This folder is a ${why.toLowerCase()}. Fathom keeps projects whole, so it won't reorganize inside one.` };
      }
    } catch {
      return { root, level: "block", message: "Fathom can't open this folder. It may have been moved or you may not have access." };
    }
  }

  if (abs.toLowerCase() === drive.toLowerCase()) {
    return { root, level: "warn", message: "This is a whole drive. Fathom skips system folders, but a scan this large can take a while." };
  }
  if (abs.toLowerCase() === resolve(opts.home).toLowerCase()) {
    return { root, level: "warn", message: "This is your whole user folder. Fathom skips app settings, but consider picking Desktop, Documents, or Downloads instead." };
  }
  return { root, level: "ok" };
}
