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

export type RuleWhen = {
  nameContains?: string;
  glob?: string;
  exts?: string[];
  pathContains?: string;
  kind?: Kind;
  minBytes?: number;
  maxBytes?: number;
  olderThanDays?: number;
  newerThanDays?: number;
};

/** A user rule: when every set condition holds, file goes to the expanded target template. */
export type Rule = { id: string; name: string; enabled: boolean; when: RuleWhen; target: string };

export type Layout = "smart" | "type" | "date" | "flat2" | "flat3" | "inplace";

/** One move the engine will perform. Paths are absolute. */
export type PlanItem = { id: string; type: "file" | "unit"; from: string; to: string; size: number; mtimeMs: number };

export type PreflightIssue = {
  id?: string;
  level: "error" | "warn";
  code: "collision" | "stale" | "missing" | "no-write" | "space" | "path-too-long" | "into-itself";
  message: string;
};

export type PreflightResult = { items: PlanItem[]; issues: PreflightIssue[]; unchanged: number };

export type RunSummary = {
  runId: string;
  moved: number;
  failed: { from: string; to: string; error: string }[];
  removedDirs: number;
  cancelled: boolean;
};

export type JournalRecord =
  | { op: "start"; runId: string; at: number; destRoot: string; roots: string[]; count: number }
  | { op: "mkdir"; path: string }
  | { op: "intent"; i: number; from: string; to: string; type: "file" | "unit" }
  | { op: "done"; i: number; mtimeMs: number; size: number }
  | { op: "fail"; i: number; error: string }
  | { op: "junk"; from: string; to: string }
  | { op: "rmdir"; path: string }
  | { op: "end"; at: number; summary: RunSummary };

export type RunStatus = "applied" | "incomplete" | "undone" | "partially-undone";

export type RunInfo = {
  runId: string;
  at: number;
  destRoot: string;
  roots: string[];
  count: number;
  moved: number;
  failed: number;
  status: RunStatus;
  undoneAt?: number;
};

export type UndoSummary = { restored: number; skipped: { path: string; reason: string }[]; cancelled?: boolean };

export type Settings = {
  rules: Rule[];
  layout: Layout;
  findDuplicates: boolean;
  readExif: boolean;
  extraSkips: string[];
  extraMarkers: string[];
  recentRoots: string[];
};

export type RootCheck = { root: string; level: "ok" | "warn" | "block"; message?: string };
