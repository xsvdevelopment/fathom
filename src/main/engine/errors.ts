const MESSAGES: Record<string, string> = {
  EBUSY: "The file is in use by another program. Close it and try again.",
  EPERM: "Windows didn't allow this. The file may be in use, read-only, or protected.",
  EACCES: "You don't have permission to change this file or folder.",
  ENOENT: "The file is no longer there. It may have been moved or deleted.",
  EEXIST: "Something with that name is already at the destination, so it was left alone.",
  ENAMETOOLONG: "The path is too long for Windows.",
  ENOSPC: "The destination drive is full.",
  EXDEV: "The file is on a different drive and couldn't be copied.",
  ENOTEMPTY: "The folder isn't empty.",
  EMFILE: "Too many files are open. Try again in a moment.",
  EIO: "The drive reported a read or write error.",
  VERIFY: "The copy didn't match the original, so the original was kept.",
  CHANGED: "The file changed after the plan was made, so it was left alone.",
};

/** A plain-language sentence for a filesystem error. */
export function friendlyError(err: unknown): string {
  const code = (err as { code?: string } | null)?.code;
  if (code && MESSAGES[code]) return MESSAGES[code]!;
  const msg = err instanceof Error ? err.message : String(err);
  return msg || "Something went wrong with this file.";
}

export function coded(code: string, message = code): Error {
  return Object.assign(new Error(message), { code });
}
