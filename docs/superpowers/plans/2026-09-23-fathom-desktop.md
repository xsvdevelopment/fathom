# Fathom Desktop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Windows desktop app that scans real folders, proposes a shallow, sensible tree, moves files on disk with a crash-safe journal, and can undo any run.

**Architecture:** Electron app built with electron-vite. `src/shared/` holds pure, fs-free logic (types, file kinds, noise heuristic, classification, layouts, trees, stats) used by both processes. `src/main/engine/` holds all disk work (scan, duplicates, preflight, apply, journal, undo, settings) behind a typed IPC surface exposed by `src/preload/`. `src/renderer/` is React + Tailwind 4, ported from the Grok prototype, with no Node access.

**Tech Stack:** Electron, electron-vite, TypeScript (strict), React 19, Tailwind 4, zustand, @tanstack/react-virtual, Radix primitives, lucide-react, sonner, exifr, vitest, Playwright (`_electron`), electron-builder, @fontsource (Figtree, Newsreader — bundled, no network).

**Spec:** `docs/superpowers/specs/2026-09-23-fathom-desktop-design.md`

## Global Constraints

- Nothing is ever deleted. Duplicates go to `_Fathom Review/Duplicates/<original rel path>`.
- Every move is journaled *before* it happens (`intent` → fsync → move → `done`).
- Protected-unit markers: `.git`, `package.json`, `Cargo.toml`, `pyproject.toml`, `*.sln`, `*.csproj`, `go.mod`, `pom.xml`, `build.gradle`, `*.xcodeproj`, `*.app`, `node_modules`, `.venv`, `*.photoslibrary`, `*.uproject`, `ProjectSettings/ProjectVersion.txt` (Unity), plus user extras.
- Skipped always: `desktop.ini`, `Thumbs.db`, `.DS_Store`, dot-files, symlinks/junctions, `$RECYCLE.BIN`, `System Volume Information`, `_Fathom Review`.
- Renderer has `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`.
- No network access at runtime (fonts bundled; CSP `default-src 'self'`).
- Paths inside the plan are `/`-separated and relative to a root; absolute paths only at the engine boundary.
- Windows collisions are compared case-insensitively.
- User data lives in `app.getPath("userData")`, overridable by env `FATHOM_DATA_DIR` (tests, e2e).
- Copy is plain-spoken: say what happened and what to do; no "IPC", "ENOENT", stack traces.

## Review Focus

1. **Case-only and odd names** (`Report.pdf` vs `report.PDF`, emoji, trailing spaces/dots, reserved names like `CON`) — collisions detected case-insensitively, generated folder names sanitized → tests in Task 2 and Task 6.
2. **Organizing in place over an already-partly-organized folder** (a source file already sits at its target; a target folder already exists with unrelated files) — no-op moves skipped, unplanned occupants get ` (2)` suffixes, never overwritten → tests in Task 6.
3. **Files in use / access denied during apply** — recorded as `fail`, run continues, undo skips them → test in Task 6 (injected fs error).
4. **Huge scans (100k+ files)** — scan streams, renderer lists are virtualized, IPC sends entries in chunks → perf test in Task 4 (20k synthetic files under 10 s), virtualization in Task 12.
5. **Dangerous roots** (`C:\`, `C:\Windows`, `Program Files`, `ProgramData`, `AppData`, the Fathom data dir) — refused or warned before scanning → test in Task 4.

---

## File Structure

```
fathom/
  package.json  electron.vite.config.ts  electron-builder.yml
  tsconfig.json tsconfig.node.json tsconfig.web.json  vitest.config.ts  eslint.config.mjs
  build/icon.png build/icon.ico
  src/shared/
    types.ts        Item, Kind, Proposal, PlanItem, Rule, Settings, RunSummary, journal records
    kinds.ts        extension → Kind, labels
    paths.ts        posix helpers, sanitizeSegment, caseKey
    noise.ts        isNoiseFolder()
    classify.ts     smart pipeline → Proposal
    rules.ts        user-rule matching + template expansion
    layouts.ts      smart | type | date | flat2 | flat3 | inplace
    tree.ts         buildTree (ported)
    stats.ts        depth stats (ported analyze, simplified)
    demo.ts         sample desk (ported) as Item[]
  src/main/
    index.ts        window, CSP, app lifecycle
    ipc.ts          handlers + progress channels
    engine/
      guard.ts      dangerous-root checks
      scan.ts       streaming walk, units, skip rules
      exif.ts       taken-date reader
      dupes.ts      size → head hash → full hash
      fsops.ts      moveFile (rename / EXDEV copy-verify), long paths
      journal.ts    append/fsync, read, status
      preflight.ts  collisions, stale, perms, space
      apply.ts      execute plan
      undo.ts       reverse + recovery (finish / rollback)
      runs.ts       list runs, summaries
      settings.ts   load/save settings.json
      datadir.ts    resolve data dir
  src/preload/index.ts   window.fathom API
  src/renderer/
    index.html
    src/main.tsx App.tsx styles.css api.ts
    src/store/{session.ts,plan.ts}
    src/components/ui/*          ported Radix wrappers
    src/components/fathom/*      ported + new (mark, glyph, waveform, tree-pane, shelf-pane, mapping-table)
    src/screens/{Home,Scanning,Studio,Apply,History,Rules}.tsx
  tests/shared/*.test.ts  tests/engine/*.test.ts  tests/helpers/fixture.ts
  e2e/smoke.spec.ts
```

---

### Task 1: Scaffold

**Files:** Create everything at repo root listed above except `src/**` contents beyond a stub window; `tests/helpers/fixture.ts`.

**Produces:** `npm run dev`, `npm test` (vitest), `npm run typecheck`, `npm run build`, `npm run dist`.

- [ ] Step 1: `npm init`, install: `electron electron-vite vite @vitejs/plugin-react typescript react react-dom tailwindcss @tailwindcss/vite zustand @tanstack/react-virtual lucide-react sonner clsx tailwind-merge class-variance-authority @radix-ui/react-{dialog,dropdown-menu,tabs,tooltip,scroll-area,slot,separator,switch,select} exifr @fontsource/figtree @fontsource/newsreader vitest @playwright/test electron-builder @types/node @types/react @types/react-dom eslint typescript-eslint`.
- [ ] Step 2: `electron.vite.config.ts` with main/preload/renderer, `@shared` alias → `src/shared`, `@` alias → `src/renderer/src`; React + Tailwind plugins on renderer.
- [ ] Step 3: Stub `src/main/index.ts` creating a 1400×900 frameless-less window (`backgroundColor #0c0c0d`, `titleBarStyle: "hidden"` with `titleBarOverlay` colors matching theme), loading renderer.
- [ ] Step 4: `tests/helpers/fixture.ts`:

```ts
export async function makeTree(spec: Record<string, string | null>): Promise<string>
// creates a temp dir; keys are rel paths; string = file content, null = empty dir. returns abs root.
export async function readTree(root: string): Promise<Record<string, string | null>>
// inverse of makeTree (files → content, empty dirs → null), sorted keys.
```

- [ ] Step 5: A sanity test `tests/helpers/fixture.test.ts` asserting `readTree(await makeTree(x))` deep-equals `x`. Run `npm test` → PASS. `npm run typecheck` → clean.
- [ ] Step 6: Commit `chore: scaffold electron app`.

### Task 2: Shared basics — types, kinds, paths, noise

**Files:** `src/shared/{types,kinds,paths,noise}.ts`, `tests/shared/{kinds,paths,noise}.test.ts`

**Produces:**
```ts
type Kind = "document"|"spreadsheet"|"presentation"|"image"|"video"|"audio"|"code"|"archive"|"installer"|"data"|"design"|"font"|"ebook"|"other";
type Item = {
  id: string; type: "file" | "unit"; root: string; rel: string; name: string; ext: string;
  size: number; mtimeMs: number; birthtimeMs: number; takenMs?: number;
  kind: Kind; fileCount?: number; unitReason?: string; duplicateOf?: string; hash?: string;
};
type Proposal = { dest: string /* rel dir under dest root */; reason: string };
kindOf(name: string): Kind
posixJoin(...p: string[]): string; parentPath(p): string; basename(p): string; extOf(name): string; depthOf(p): number;
sanitizeSegment(s: string): string   // strips <>:"/\|?* and control chars, trailing dots/spaces, maps reserved (CON, PRN, AUX, NUL, COM1-9, LPT1-9) to "_CON" etc., empty → "Untitled"
caseKey(p: string): string            // p.normalize("NFC").toLowerCase()
isNoiseFolder(name: string): boolean
```

- [ ] Step 1: Tests.

```ts
// noise.test.ts
it.each(["New folder","New folder (3)","untitled folder","stuff","Misc","old","Backup","temp","final","FINAL FINAL","Copy of Desktop","v2","2019","12","Desktop","Documents","Downloads","a","aaaaaaa","___"])("noise: %s", n => expect(isNoiseFolder(n)).toBe(true));
it.each(["Acme","Italy 2019","Thesis","Taxes","Harbor Studio","Recipes","Q3 Report"])("meaningful: %s", n => expect(isNoiseFolder(n)).toBe(false));
// paths.test.ts
expect(sanitizeSegment('a<b>:c?.')).toBe("a_b__c_");
expect(sanitizeSegment("CON")).toBe("_CON");
expect(sanitizeSegment("  ")).toBe("Untitled");
expect(caseKey("Report.PDF")).toBe(caseKey("report.pdf"));
// kinds.test.ts
expect(kindOf("a.PPTX")).toBe("presentation"); expect(kindOf("setup.msi")).toBe("installer");
expect(kindOf("x.ttf")).toBe("font"); expect(kindOf("book.epub")).toBe("ebook"); expect(kindOf("noext")).toBe("other");
```
- [ ] Step 2: Run → FAIL. Step 3: Implement (port `kind.ts` table from prototype; add presentation `.ppt .pptx .key .odp`, installer `.exe .msi .dmg .pkg .appx .msix`, font `.ttf .otf .woff .woff2`, ebook `.epub .mobi .azw3`, move `.json` to data). Noise: regex list of generic words, `^v\d+$`, `^\d+$`, `^(.)\1+$`, `^[\W_]+$`, length ≤ 1, `copy of .*`, `new folder( \(\d+\))?`, `final( final)*`, profile names.
- [ ] Step 4: Run → PASS. Step 5: Commit `feat(shared): kinds, paths, noise heuristic`.

### Task 3: Classification, user rules, layouts

**Files:** `src/shared/{classify,rules,layouts,tree,stats,demo}.ts`, `tests/shared/{classify,rules,layouts}.test.ts`

**Consumes:** Task 2. **Produces:**
```ts
type Rule = { id: string; name: string; enabled: boolean;
  when: { nameContains?: string; glob?: string; exts?: string[]; pathContains?: string; kind?: Kind; minBytes?: number; maxBytes?: number; olderThanDays?: number; newerThanDays?: number };
  target: string /* template e.g. "Finance/Invoices/{year}" */ };
matchRule(item: Item, rule: Rule, now: number): boolean
expandTemplate(tpl: string, item: Item): string   // {year} {month} {kind} {ext} {parent}; each segment sanitized
classifySmart(item: Item): Proposal
type Layout = "smart"|"type"|"date"|"flat2"|"flat3"|"inplace";
proposeAll(items: Item[], layout: Layout, rules: Rule[], now: number): Map<string, Proposal>
// order: enabled user rules → duplicates → units → layout. duplicates dest = "_Fathom Review/Duplicates/" + parentPath(rel)
itemDate(item): number  // takenMs ?? min(birthtimeMs, mtimeMs) (ignore birthtime 0)
buildTree(entries: {id:string; path:string; size:number}[]): TreeNode   // path = rel file path
depthStats(paths: string[]): { maxDepth: number; byDepth: number[]; deepestPath: string }
buildDemoItems(): Item[]
```

- [ ] Step 1: Tests (table-driven, item factory `mk({rel, size?, takenMs?, type?})`):

```ts
expect(classifySmart(mk({rel:"Desktop/Screenshot 2023-04-01 at 10.00.png"})).dest).toBe("Media/Screenshots/2023");
expect(classifySmart(mk({rel:"Downloads/ChromeSetup.exe"})).dest).toBe("Inbox/Installers");
expect(classifySmart(mk({rel:"Documents/stuff/tax-return-2019.pdf"})).dest).toBe("Finance/Taxes/2019");
expect(classifySmart(mk({rel:"Documents/New folder/W2_2021.pdf"})).dest).toBe("Finance/Taxes/2021");
expect(classifySmart(mk({rel:"Work/Clients/Acme/final/invoice-001.pdf"})).dest).toBe("Finance/Acme");
expect(classifySmart(mk({rel:"Desktop/old/Resume_2024.docx"})).dest).toBe("Work/Resume");
expect(classifySmart(mk({rel:"Pictures/Italy 2019/IMG_1.jpg"})).dest).toBe("Media/Italy 2019");
expect(classifySmart(mk({rel:"DCIM/100APPLE/IMG_2.HEIC", takenMs: Date.UTC(2021,5,1)})).dest).toBe("Media/Photos 2021");
expect(classifySmart(mk({rel:"Work/Clients/Acme/brand/notes.docx"})).dest).toBe("Work/Acme");
expect(classifySmart(mk({rel:"School/Thesis/drafts/ch1.docx"})).dest).toBe("Studies/Thesis");
expect(classifySmart(mk({rel:"stuff/misc/random.txt"})).dest).toBe("Documents");
expect(classifySmart(mk({rel:"a/b/c/d/e/f/g/h/Recipes/pie.pdf"})).dest).toBe("Personal/Recipes");
expect(classifySmart(mk({rel:"fonts/Inter.ttf"})).dest).toBe("Design/Fonts");
expect(classifySmart(mk({rel:"x/y.zzz"})).dest).toBe("Inbox/Unsorted");
// units
expect(classifySmart(mk({rel:"Desktop/old/my-app", type:"unit"})).dest).toBe("Code");
// rules
const r = { id:"1", name:"Invoices", enabled:true, when:{ nameContains:"invoice" }, target:"Finance/Invoices/{year}" };
expect(proposeAll([mk({rel:"a/Invoice-7.pdf", mtimeMs: Date.UTC(2022,0,2)})], "smart", [r], NOW).get(id)!.dest).toBe("Finance/Invoices/2022");
// layouts
expect(proposeAll([file],"type",[],NOW).get(id)!.dest).toBe("Documents/2022");
expect(proposeAll([file],"date",[],NOW).get(id)!.dest).toBe("2022/01");
expect(proposeAll([mk({rel:"a/b/c/d/x.txt"})],"flat2",[],NOW).get(id)!.dest).toBe("a/b");
expect(proposeAll([mk({rel:"a/b/c/d/x.txt"})],"inplace",[],NOW).get(id)!.dest).toBe("a/b/c/d");
// duplicate
expect(proposeAll([mk({rel:"a/b/x.txt", duplicateOf:"k"})],"smart",[],NOW).get(id)!.dest).toBe("_Fathom Review/Duplicates/a/b");
```
- [ ] Step 2: Run → FAIL. Step 3: Implement. Smart pipeline order: screenshot (`/^(screenshot|screen shot|capture|snip)/i`) → installer kind in path containing `download` or at root → taxes (`/\btax(es)?\b|\bw-?2\b|\b1099\b|return-\d{4}/i`, year from name then path then date) → finance docs (`invoice|receipt|statement|bank|payslip|paystub`) with project = nearest meaningful non-generic ancestor (skip `work|clients|documents|finance`) else `Records` → resume/CV → font → ebook → image/video (Media/<meaningful ancestor, excluding pictures/photos/dcim/camera> [year]) or `Photos {year}` / `Video {year}` → audio `Media/Audio` → area keywords on meaningful ancestors (`work|clients?|job|office|freelance`→Work, `school|university|college|thesis|homework|course|class`→Studies, `personal|family|home|wedding|kids|travel|medical|recipes|house`→Personal, `projects|code|dev|src`→Code) with project = nearest meaningful ancestor below the keyword folder (Studies: first meaningful after the keyword) → kind fallback (document/spreadsheet/presentation → `Documents`, archive → `Inbox/Archives`, design → `Design`, data → `Code/Data`, code → `Code/Loose files`) → `Inbox/Unsorted`. Port `tree.ts` and depth stats; port demo desk to `Item[]`.
- [ ] Step 4: Run → PASS. Step 5: Commit `feat(shared): smart classification, rules, layouts`.

### Task 4: Scan + guard

**Files:** `src/main/engine/{guard,scan,exif,datadir}.ts`, `tests/engine/{scan,guard}.test.ts`

**Produces:**
```ts
type ScanProgress = { files: number; dirs: number; bytes: number; current: string };
type ScanResult = { items: Item[]; errors: { path: string; message: string }[]; roots: string[] };
scan(roots: string[], opts: { extraMarkers?: string[]; extraSkips?: string[]; onProgress?: (p: ScanProgress) => void; signal?: AbortSignal; readExif?: boolean }): Promise<ScanResult>
checkRoot(abs: string, dataDir: string): { ok: boolean; level: "block" | "warn" | "ok"; message?: string }
readTakenDate(abs: string): Promise<number | undefined>
dataDir(): string
```

- [ ] Step 1: Tests: fixture with `a/b/c/x.txt`, `proj/.git/HEAD`, `proj/src/i.ts`, `node/package.json`, `node/node_modules/z/i.js`, `desktop.ini`, `.hidden`, `_Fathom Review/Duplicates/q.txt`, `empty/` →
  items contain file `a/b/c/x.txt`; unit `proj` (reason `.git`, fileCount 2); unit `node` (fileCount 2); no `desktop.ini`, `.hidden`, `_Fathom Review/...`. Abort signal → rejects with `AbortError`. Perf: 20,000 generated files scanned < 10 s. Guard: `C:\` → warn, `C:\Windows` / `C:\Program Files` / dataDir → block, `C:\Users\me\Desktop` → ok (use `path.win32` cases; skip-if not win32 for real-fs parts).
- [ ] Step 2: FAIL. Step 3: Implement: iterative DFS with `fs.promises.opendir`; `lstat` per entry (skip `isSymbolicLink()`); for each dir, peek children names for markers before descending; unit size via second walk (counted, not listed). Ids = `sha1(root + "\0" + rel).slice(0,16)`. EXIF only for `jpg jpeg heic heif tif tiff dng cr2 nef arw` via `exifr.parse(abs, { pick: ["DateTimeOriginal"] })` guarded by try/catch, concurrency 8. Progress throttled to 250 ms.
- [ ] Step 4: PASS. Step 5: Commit `feat(engine): streaming scan with protected units`.

### Task 5: Duplicates

**Files:** `src/main/engine/dupes.ts`, `tests/engine/dupes.test.ts`

**Produces:** `findDuplicates(items: Item[], opts: { onProgress?: (done: number, total: number) => void; signal?: AbortSignal }): Promise<Item[]>` — returns items with `hash`/`duplicateOf` set; units ignored.

- [ ] Step 1: Tests: three identical 5 KB files at depths 1/3/5 → deepest two get `duplicateOf` = shallowest; same size different content → no dupes; files < 1 KB ignored; tie on depth → older mtime kept; 70 KB files differing only after 64 KB → not dupes.
- [ ] Step 2: FAIL. Step 3: Implement (stream sha1; concurrency 4). Step 4: PASS. Step 5: Commit `feat(engine): content duplicate detection`.

### Task 6: fsops, journal, preflight, apply

**Files:** `src/main/engine/{fsops,journal,preflight,apply}.ts`, `tests/engine/{apply,preflight}.test.ts`

**Produces:**
```ts
type PlanItem = { id: string; from: string; to: string; size: number; mtimeMs: number; type: "file" | "unit" }; // absolute
type Journal records (JSONL): {op:"start", runId, at, destRoot, roots, count} | {op:"mkdir", path} | {op:"intent", i, from, to} | {op:"done", i} | {op:"fail", i, error} | {op:"rmdir", path} | {op:"end", at, summary, cancelled?}
type Fs = Pick<typeof import("node:fs/promises"), "rename"|"copyFile"|"unlink"|"mkdir"|"rm"|"stat"|"lstat"|"readdir"|"rmdir"|"open"|"cp">;
moveEntry(from: string, to: string, type: "file"|"unit", fs?: Fs): Promise<void>   // rename; EXDEV → copy + verify (size+sha1 for files, file count+bytes for units) → remove source
toLong(p: string): string   // \\?\ prefix when length ≥ 248 on win32
type PreflightIssue = { id?: string; level: "error"|"warn"; code: "collision"|"stale"|"missing"|"no-write"|"space"|"path-too-long"|"noop"; message: string };
preflight(items: PlanItem[], destRoot: string): Promise<{ items: PlanItem[] /* collisions resolved with " (n)" suffix, no-ops removed */; issues: PreflightIssue[] }>
applyPlan(items: PlanItem[], opts: { runId: string; destRoot: string; roots: string[]; dataDir: string; fs?: Fs; onProgress?: (done: number, total: number, current: string) => void; signal?: AbortSignal; crashAfter?: number /* test hook */ }): Promise<RunSummary>
type RunSummary = { runId: string; moved: number; failed: { from: string; to: string; error: string }[]; removedDirs: number; cancelled: boolean };
```

- [ ] Step 1: Tests:
  - round trip: fixture `{ "a/b/c/x.txt":"x", "a/b/y.txt":"y", "keep/z.txt":"z" }`, plan x → `Docs/x.txt`, y → `Docs/y.txt` → tree becomes `{ "Docs/x.txt":"x", "Docs/y.txt":"y", "keep/z.txt":"z" }` (empty `a/b/c`, `a/b`, `a` removed), journal has start/mkdir/intent/done/rmdir/end.
  - collision with an unplanned existing file `Docs/x.txt` → planned goes to `Docs/x (2).txt`, original untouched.
  - case-only collision `Docs/X.txt` vs planned `docs/x.txt` → suffixed.
  - two planned items to same target → second suffixed.
  - noop (from === to) → removed from plan, issue `noop`.
  - stale: file modified after scan (mtime differs) → issue `stale`, excluded.
  - injected `rename` throwing `EBUSY` for one file → summary.failed has it, others moved, journal `fail`.
  - EXDEV injected → copy path used, content equal, source removed.
  - unit move: `proj/` with `.git/HEAD` moved whole to `Code/proj`.
  - never removes a non-empty dir; never removes a root.
- [ ] Step 2: FAIL. Step 3: Implement. Journal writer: `fs.open(path,"a")`, `write(line+"\n")`, `datasync()` after each `intent` and `mkdir`, batch-sync `done` every 50 records and at end. rmdir pass: collect parent dirs of all `from` (up to, excluding, the root), sort by depth desc, `rmdir` if `readdir` empty after ignoring `desktop.ini`/`Thumbs.db`/`.DS_Store` (those junk files are moved into run's `junk/` folder under dataDir and journaled as moves so undo restores them).
- [ ] Step 4: PASS. Step 5: Commit `feat(engine): journaled apply with preflight`.

### Task 7: Undo, recovery, runs

**Files:** `src/main/engine/{undo,runs}.ts`, `tests/engine/undo.test.ts`

**Produces:**
```ts
readJournal(runDir: string): Promise<JournalRecord[]>
listRuns(dataDir: string): Promise<RunInfo[]>   // RunInfo = { runId, at, destRoot, roots, count, moved, failed, status: "applied"|"incomplete"|"undone"|"partially-undone", undoneAt? }
undoRun(runId: string, opts: { dataDir: string; fs?: Fs; onProgress?; signal? }): Promise<UndoSummary>  // UndoSummary = { restored: number; skipped: { path: string; reason: string }[] }
finishRun(runId: string, opts): Promise<RunSummary>    // continue an incomplete run
incompleteRuns(dataDir): Promise<RunInfo[]>
```

- [ ] Step 1: Tests:
  - apply then undo → `readTree` equals original fixture exactly (including empty dirs that were removed).
  - file edited after apply → skipped with reason "changed since", others restored.
  - original location now occupied → restored as `name (restored).ext`.
  - crash: `applyPlan(..., { crashAfter: 2 })` throws after 2nd intent with move done but no `done` record → `incompleteRuns` lists it → `finishRun` completes all → tree equals fully-applied expectation. Separate case: crash → `undoRun` rolls back → tree equals original. Intent-without-done where move did NOT happen is handled (check `from` exists / `to` exists).
  - undo twice → second call throws "already undone".
- [ ] Step 2: FAIL. Step 3: Implement (undo writes `undo.jsonl` with same intent/done protocol; status derived from both journals). Step 4: PASS. Step 5: Commit `feat(engine): undo and crash recovery`.

### Task 8: Settings

**Files:** `src/main/engine/settings.ts`, `tests/engine/settings.test.ts`

**Produces:** `type Settings = { rules: Rule[]; layout: Layout; findDuplicates: boolean; readExif: boolean; extraSkips: string[]; extraMarkers: string[]; recentRoots: string[] }`; `loadSettings(dataDir): Promise<Settings>` (defaults on missing/corrupt, corrupt file renamed `.bak`); `saveSettings(dataDir, s)` (atomic write via temp + rename).

- [ ] TDD as above (missing → defaults; round-trip; corrupt → defaults + `.bak` exists). Commit `feat(engine): settings store`.

### Task 9: IPC + preload

**Files:** `src/main/ipc.ts`, `src/main/index.ts`, `src/preload/index.ts`, `src/shared/api.ts`

**Produces** (`window.fathom`, typed in `src/shared/api.ts`):
```ts
pickFolders(): Promise<string[]>; pickFolder(): Promise<string | null>;
checkRoots(roots: string[]): Promise<{ root: string; level: "ok"|"warn"|"block"; message?: string }[]>;
scan(roots: string[]): Promise<{ jobId: string }>;          // events: "scan:progress", "scan:chunk" (Item[] ≤ 5000), "scan:done" ({errors}), "scan:error"
findDuplicates(): Promise<{ jobId }>;                          // operates on last scan in main; events "dupes:progress", "dupes:done" ({ updates: {id, duplicateOf, hash}[] })
cancel(jobId: string): Promise<void>;
preflight(items: PlanItem[], destRoot: string): Promise<{ items: PlanItem[]; issues: PreflightIssue[] }>;
apply(items: PlanItem[], destRoot: string, roots: string[]): Promise<{ jobId; runId }>;   // "apply:progress", "apply:done" (RunSummary)
listRuns(): Promise<RunInfo[]>; undo(runId): Promise<{ jobId }>; finish(runId): Promise<{ jobId }>;  // "undo:*", "finish:*"
loadSettings(): Promise<Settings>; saveSettings(s: Settings): Promise<void>;
reveal(absPath: string): Promise<void>; openPath(absPath: string): Promise<void>;
exportCsv(rows: string): Promise<string | null>;               // save dialog
on(channel: string, cb: (payload: unknown) => void): () => void;
```
- [ ] Main keeps last scan items in memory for dupes. Errors cross as `{ code, message }` via a `friendlyError(e)` mapper (`EBUSY/EPERM/EACCES/ENOENT/ENAMETOOLONG/ENOSPC/EXDEV`) — unit-test the mapper in `tests/engine/errors.test.ts`.
- [ ] Commit `feat: typed IPC bridge`.

### Task 10: Renderer shell + Home

**Files:** `src/renderer/**` (port `ui/*`, `mark`, `file-glyph` with new kinds, `depth-waveform`, styles with bundled fonts), `screens/Home.tsx`, `store/session.ts`, `App.tsx`.

- Home: hero copy adapted for desktop ("Nothing is deleted. Every move can be undone."), primary "Choose folders…", recent roots list, drag-and-drop folders onto window (Electron `webUtils.getPathForFile` via preload), "Try the sample desk" (plan-only), banner for incomplete runs with Finish / Roll back, link to History and Rules. Root check results shown inline (warn = confirm, block = explain).
- session store: `screen: "home"|"scanning"|"studio"|"apply"|"history"|"rules"`, `roots`, `items`, `sample: boolean`, `settings`.
- [ ] Verify: `npm run dev`, Home renders, pick folder works. Commit `feat(ui): shell and home`.

### Task 11: Scanning screen

- Live counters (files, folders, size), current path (truncated middle), cancel; then duplicate pass with its own bar and "Skip" button; errors list collapsible; auto-advance to Studio.
- [ ] Commit `feat(ui): scanning progress`.

### Task 12: Studio

**Files:** `store/plan.ts`, `screens/Studio.tsx`, `components/fathom/{tree-pane,shelf-pane,mapping-table,filters,dest-picker}.tsx`

**plan store:**
```ts
layout: Layout; dest: Record<string, string>; reason: Record<string, string>; locked: Set<string>; excluded: Set<string>;
history: Snapshot[] (≤ 50); destRoot: string; filter: "all"|"moved"|"unchanged"|"duplicates"|"excluded"|"units"; query: string; selected: Set<string>;
recompute(items, settings) // proposeAll, keep locked/excluded dests
moveTo(ids, destDir) // locks them; toggleLock(ids); toggleExclude(ids); undo(); setLayout(l)
planItems(items): PlanItem[] // non-excluded items whose dest differs; absolute from/to
```
- Header: roots, stats (files, depth before→after, duplicates, total size), layout segmented control (Smart / By type / By date / Max 3 / Max 2 / Keep), search, Undo, "Review & apply".
- Left: original tree (virtualized flattening of expanded nodes). Right tabs: Shelves (areas → projects, drop targets, virtualized files per project with "show all"), Every mapping (virtualized table with reason column), filters.
- Selection toolbar: Move to… (dest picker with create-new-folder), Lock, Exclude, Reveal in Explorer.
- Destination root selector (in place / choose folder). Export CSV.
- Unit rows render with a folder-package glyph and file count.
- [ ] Verify with sample desk and a real 10k-file folder; typing in search stays responsive. Commit `feat(ui): studio plan review`.

### Task 13: Preflight + Apply screen

- "Review & apply" opens a sheet: summary counts, preflight issues grouped (errors block, warnings need a checkbox acknowledgement), explicit sentence "N files will move. Nothing will be deleted. You can undo this from History." Apply → progress (count, current file, cancel) → result: moved, failed list with Reveal, removed empty folders, "Open destination", "Undo this run", "Done".
- Sample mode: apply button disabled with explanation.
- [ ] Commit `feat(ui): preflight and apply`.

### Task 14: History + Rules

- History: list runs (date, destination, moved/failed, status), Undo with confirm + progress + result (skipped list), Finish/Roll back for incomplete, Reveal run folder.
- Rules: list with enable switch, reorder (up/down), edit form (conditions + target template with token chips), live "matches N files in current scan" preview when a scan is loaded; saved via `saveSettings`. Also toggles: find duplicates, read photo dates, extra skip patterns, extra project markers.
- [ ] Commit `feat(ui): history and rules`.

### Task 15: Packaging, e2e, README

- `electron-builder.yml`: appId `dev.xsv.fathom`, productName Fathom, win targets `portable` + `nsis` (x64), icon from `build/icon.png` (generated from mark SVG at 512px via a small script using Electron `nativeImage` or sharp-free canvas render), `asar: true`.
- `e2e/smoke.spec.ts` (Playwright `_electron.launch` on built app with `FATHOM_DATA_DIR` temp): create fixture folder → drive UI: choose folder (dialog stubbed via `FATHOM_TEST_PICK` env read in main) → wait for Studio → Review & apply → Apply → assert on disk → History → Undo → assert original tree restored.
- README: what it does, safety model, how to run/build, where data lives.
- [ ] `npm run typecheck && npm test && npm run build && npx playwright test && npm run dist` all pass. Commit `chore: packaging, e2e smoke, README`.

---

## Self-review notes

- Spec coverage: scan/units/skips (T4), EXIF (T4), duplicates (T5), classification + rules + layouts (T3), studio features (T12), preflight/apply/journal/EXDEV/long paths/rmdir (T6), recovery (T7), undo (T7), settings + rules editor (T8, T14), errors (T9 mapper, T13 UI), testing (all), packaging (T15), sample desk plan-only (T10/T13), CSV export (T12).
- Types used across tasks: `Item`, `Proposal`, `PlanItem`, `Rule`, `Settings`, `RunSummary`, `RunInfo`, `Layout` — defined in T2/T3/T6/T7/T8 and collected in `src/shared/types.ts`.
