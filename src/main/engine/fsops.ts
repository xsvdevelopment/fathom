import * as nodeFs from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, join } from "node:path";
import { coded } from "./errors";
import { fullHash } from "./dupes";

/** The slice of fs/promises the engine touches; injectable so tests can simulate failures. */
export type Fs = Pick<
  typeof nodeFs,
  "rename" | "copyFile" | "unlink" | "mkdir" | "rm" | "rmdir" | "stat" | "lstat" | "readdir" | "open" | "cp" | "utimes"
>;

export const realFs: Fs = nodeFs;

/** Adds the Windows long-path prefix when a path is near the 260-character limit. */
export function toLong(p: string): string {
  if (process.platform !== "win32" || p.length < 248 || p.startsWith("\\\\?\\")) return p;
  if (p.startsWith("\\\\")) return `\\\\?\\UNC\\${p.slice(2)}`;
  return `\\\\?\\${p}`;
}

export async function exists(fs: Fs, p: string): Promise<boolean> {
  try {
    await fs.lstat(toLong(p));
    return true;
  } catch (err) {
    if ((err as { code?: string }).code === "ENOENT") return false;
    throw err;
  }
}

/** True when `a` and `b` are the same entry on disk (e.g. a case-only rename on Windows). */
async function sameEntry(fs: Fs, a: string, b: string): Promise<boolean> {
  try {
    const [sa, sb] = await Promise.all([fs.lstat(toLong(a)), fs.lstat(toLong(b))]);
    return sa.ino === sb.ino && sa.dev === sb.dev && sa.ino !== 0;
  } catch {
    return false;
  }
}

async function measure(fs: Fs, abs: string): Promise<{ files: number; bytes: number }> {
  let files = 0;
  let bytes = 0;
  const stack = [abs];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const e of await fs.readdir(toLong(dir), { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) {
        files += 1;
        bytes += (await fs.lstat(toLong(p))).size;
      }
    }
  }
  return { files, bytes };
}

/**
 * Moves a file or a whole folder. Never overwrites: fails with EEXIST if `to` exists.
 * Same drive: a rename. Different drive: copy to a temp name, verify, rename into place, remove the source.
 * The destination's parent folder must already exist.
 */
export async function moveEntry(from: string, to: string, type: "file" | "unit", fs: Fs = realFs): Promise<void> {
  if ((await exists(fs, to)) && !(await sameEntry(fs, from, to))) throw coded("EEXIST");
  try {
    await fs.rename(toLong(from), toLong(to));
    return;
  } catch (err) {
    if ((err as { code?: string }).code !== "EXDEV") throw err;
  }

  const tmp = join(dirname(to), `.${Date.now().toString(36)}.fathom-partial`);
  try {
    if (type === "file") {
      await fs.copyFile(toLong(from), toLong(tmp), constants.COPYFILE_EXCL);
      const [src, dst] = await Promise.all([fs.stat(toLong(from)), fs.stat(toLong(tmp))]);
      if (src.size !== dst.size || (await fullHash(toLong(from))) !== (await fullHash(toLong(tmp)))) {
        throw coded("VERIFY");
      }
      await fs.utimes(toLong(tmp), src.atime, src.mtime);
    } else {
      await fs.cp(toLong(from), toLong(tmp), { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
      const [a, b] = await Promise.all([measure(fs, from), measure(fs, tmp)]);
      if (a.files !== b.files || a.bytes !== b.bytes) throw coded("VERIFY");
    }
    await fs.rename(toLong(tmp), toLong(to));
  } catch (err) {
    await fs.rm(toLong(tmp), { recursive: true, force: true }).catch(() => {});
    throw err;
  }
  await fs.rm(toLong(from), { recursive: type === "unit", force: false });
}
