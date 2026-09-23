import exifr from "exifr";

export const EXIF_EXTS = new Set([".jpg", ".jpeg", ".heic", ".heif", ".tif", ".tiff", ".dng", ".cr2", ".cr3", ".nef", ".arw"]);

/** Photo capture time from EXIF DateTimeOriginal, or undefined when absent or unreadable. */
export async function readTakenDate(abs: string): Promise<number | undefined> {
  try {
    const out = (await exifr.parse(abs, { pick: ["DateTimeOriginal"] })) as { DateTimeOriginal?: unknown } | undefined;
    const d = out?.DateTimeOriginal;
    if (d instanceof Date && !Number.isNaN(d.getTime()) && d.getFullYear() > 1980) return d.getTime();
  } catch {
    // Not a photo we can read; fall back to file dates.
  }
  return undefined;
}
