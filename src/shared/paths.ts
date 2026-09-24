export function posixJoin(...parts: string[]): string {
  return parts
    .flatMap((part) => part.split("/"))
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && part !== ".")
    .join("/");
}

export function parentPath(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "" : path.slice(0, i);
}

export function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i < 0 ? path : path.slice(i + 1);
}

export function extOf(name: string): string {
  const i = name.lastIndexOf(".");
  if (i <= 0) return "";
  return name.slice(i).toLowerCase();
}

export function stemOf(name: string): string {
  const ext = extOf(name);
  return ext ? name.slice(0, -ext.length) : name;
}

export function depthOf(path: string): number {
  if (!path) return 0;
  return path.split("/").filter(Boolean).length;
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i;

/** Makes one path segment safe as a Windows folder/file name. */
export function sanitizeSegment(s: string): string {
  let out = s.replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim();
  if (!out) return "Untitled";
  if (RESERVED.test(out)) out = `_${out}`;
  return out;
}

/** Key for case-insensitive, normalization-insensitive path comparison (Windows semantics). */
export function caseKey(p: string): string {
  return p.normalize("NFC").toLowerCase();
}
