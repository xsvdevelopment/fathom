export const KINDS = [
  "document",
  "spreadsheet",
  "presentation",
  "image",
  "video",
  "audio",
  "code",
  "archive",
  "installer",
  "data",
  "design",
  "font",
  "ebook",
  "other",
] as const;

export type Kind = (typeof KINDS)[number];

/** One scanned thing: a file, or a protected unit (a project folder that moves whole). */
export type Item = {
  id: string;
  type: "file" | "unit";
  /** Absolute root folder the user picked. */
  root: string;
  /** "/"-separated path relative to root. */
  rel: string;
  name: string;
  ext: string;
  size: number;
  mtimeMs: number;
  birthtimeMs: number;
  /** EXIF DateTimeOriginal for photos. */
  takenMs?: number;
  kind: Kind;
  /** Units only: number of files inside. */
  fileCount?: number;
  /** Units only: the marker that made it a unit, e.g. ".git". */
  unitReason?: string;
  duplicateOf?: string;
  hash?: string;
};

/** Where classification wants an item: a "/"-separated dir relative to the destination root. */
export type Proposal = { dest: string; reason: string };
