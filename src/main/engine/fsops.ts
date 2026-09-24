import * as nodeFs from "node:fs/promises";
import { constants } from "node:fs";
import { basename, dirname, join } from "node:path";
import { coded } from "./errors";
import { fullHash } from "./dupes";

/** The slice of fs/promises the engine touches; injectable so tests can simulate failures. */
export type Fs = Pick<
  typeof nodeFs,
  "rename" | "copyFile" | "unlink" | "link" | "writeFile" | "mkdir" | "rm" | "rmdir" | "stat" | "lstat" | "readdir" | "open" | "cp" | "utimes"
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
export async function sameEntry(fs: Fs, a: string, b: string): Promise<boolean> {
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

const code = (err: unknown) => (err as { code?: string } | null)?.code;
const uniq = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/** Puts a verified temp file at `to` without ever replacing something that appeared there meanwhile. */
async function placeFile(tmp: string, to: string, fs: Fs): Promise<void> {
  try {
    // A hard link fails with EEXIST if `to` exists, atomically. (Windows rename would replace it.)
    await fs.link(toLong(tmp), toLong(to));
    await fs.unlink(toLong(tmp));
    return;
  } catch (err) {
    if (code(err) === "EEXIST") throw err;
    // FAT/exFAT and some network drives have no hard links: fall back to check-then-rename.
  }
  if (await exists(fs, to)) throw coded("EEXIST");
  await fs.rename(toLong(tmp), toLong(to));
}

/**
 * Moves a file or a whole folder. Never overwrites: fails with EEXIST if `to` exists.
 * Same drive: a rename. Different drive: copy to a temp name and verify it; release the source;
 * put the copy in place. If the source can't be released the copy is discarded and the source stays.
 * Throws code SOURCE_LEFT (with the leftover path as message) when a folder's copy is in place but
 * some of its original files couldn't be cleared.
 * The destination's parent folder must already exist.
 */
export async function moveEntry(from: string, to: string, type: "file" | "unit", fs: Fs = realFs): Promise<void> {
  if ((await exists(fs, to)) && !(await sameEntry(fs, from, to))) throw coded("EEXIST");
  try {
    await fs.rename(toLong(from), toLong(to));
    return;
  } catch (err) {
    if (code(err) !== "EXDEV") throw err;
  }

  const tmp = join(dirname(to), `.${uniq()}.fathom-partial`);
  const discard = () => fs.rm(toLong(tmp), { recursive: true, force: true }).catch(() => {});
  try {
    if (type === "file") {
      await fs.copyFile(toLong(from), toLong(tmp), constants.COPYFILE_EXCL);
      const [src, dst] = await Promise.all([fs.stat(toLong(from)), fs.stat(toLong(tmp))]);
      if (src.size !== dst.size || (await fullHash(toLong(from))) !== (await fullHash(toLong(tmp)))) throw coded("VERIFY");
      await fs.utimes(toLong(tmp), src.atime, src.mtime);
    } else {
      await fs.cp(toLong(from), toLong(tmp), { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
      const [a, b] = await Promise.all([measure(fs, from), measure(fs, tmp)]);
      if (a.files !== b.files || a.bytes !== b.bytes) throw coded("VERIFY");
    }
  } catch (err) {
    await discard();
    throw err;
  }

  if (type === "file") {
    try {
      await placeFile(tmp, to, fs);
    } catch (err) {
      await discard();
      throw err;
    }
    try {
      await fs.unlink(toLong(from));
    } catch (err) {
      // The original is locked: take our copy back out so the file exists in exactly one place.
      await fs.unlink(toLong(to)).catch(() => {});
      throw err;
    }
    return;
  }

  // Folders: first move the original aside in one step (fails if anything inside is locked),
  // so it is never half-deleted while still under its own name.
  const leftover = join(dirname(from), `.${basename(from)}.${uniq()}.fathom-leftover`);
  try {
    await fs.rename(toLong(from), toLong(leftover));
  } catch (err) {
    await discard();
    throw err;
  }
  try {
    if (await exists(fs, to)) throw coded("EEXIST");
    await fs.rename(toLong(tmp), toLong(to));
  } catch (err) {
    await fs.rename(toLong(leftover), toLong(from)).catch(() => {});
    await discard();
    throw err;
  }
  try {
    await fs.rm(toLong(leftover), { recursive: true, force: false });
  } catch {
    throw coded("SOURCE_LEFT", leftover);
  }
}
