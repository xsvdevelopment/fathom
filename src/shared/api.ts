import type {
  Item,
  PlanItem,
  PreflightResult,
  RootCheck,
  RunInfo,
  RunSummary,
  Settings,
  UndoSummary,
} from "./types";

export type JobKind = "scan" | "dupes" | "apply" | "undo" | "finish";

export type ScanDone = { errors: { path: string; message: string }[]; count: number };
export type DupesDone = { updates: { id: string; duplicateOf?: string; hash?: string }[] };

export type JobEvent =
  | {
      jobId: string;
      kind: JobKind;
      type: "progress";
      done?: number;
      total?: number;
      current?: string;
      files?: number;
      dirs?: number;
      bytes?: number;
    }
  | { jobId: string; kind: "scan"; type: "chunk"; items: Item[] }
  | { jobId: string; kind: JobKind; type: "done"; result: ScanDone | DupesDone | RunSummary | UndoSummary }
  | { jobId: string; kind: JobKind; type: "error"; message: string; cancelled?: boolean };

/** Everything the window can ask of the app. Exposed as `window.fathom` by the preload script. */
export interface FathomApi {
  pickFolders(): Promise<string[]>;
  pickFolder(): Promise<string | null>;
  pathForFile(file: File): string;
  checkRoots(roots: string[]): Promise<RootCheck[]>;
  scan(roots: string[]): Promise<{ jobId: string }>;
  findDuplicates(): Promise<{ jobId: string }>;
  cancel(jobId: string): Promise<void>;
  preflight(items: PlanItem[], destRoot: string): Promise<PreflightResult>;
  apply(items: PlanItem[], destRoot: string, roots: string[]): Promise<{ jobId: string; runId: string }>;
  listRuns(): Promise<RunInfo[]>;
  undo(runId: string): Promise<{ jobId: string }>;
  finish(runId: string): Promise<{ jobId: string }>;
  loadSettings(): Promise<Settings>;
  saveSettings(s: Settings): Promise<void>;
  reveal(path: string): Promise<void>;
  openPath(path: string): Promise<void>;
  runFolder(runId: string): Promise<void>;
  exportCsv(csv: string, suggestedName: string): Promise<string | null>;
  onJob(cb: (e: JobEvent) => void): () => void;
  version: string;
}
