# Fathom Desktop — Design

Date: 2026-09-23
Status: approved in chat, pending written-spec review

## Intent

**What the user said:** finish the Grok-built Fathom prototype, make it immensely
better, and make it a standalone application they can use.

**Agreed decisions:**
- It reorganizes real files on disk (moves), with a full undo journal.
- Classification is local-only: rules + file metadata + content hashing. No network.
- Electron + React, reusing the prototype's UI and classification ideas.

**Assumptions:** single user, Windows 11 primary target, used on personal
folders (Desktop, Downloads, Documents, old backups) that can hold 10k–200k files.

**Success criteria:**
1. The user can point Fathom at a real folder, review a proposed tree, apply it,
   and get a tidier folder with no data lost.
2. Any applied run can be fully undone from the History screen.
3. A crash mid-apply never leaves files unaccounted for: on relaunch, the run
   can be completed or rolled back.
4. Project folders (git repos, code projects, app bundles) are never split.
5. Ships as a portable `Fathom.exe` and an installer.

## Non-goals

- Deleting anything. Duplicates are quarantined, never removed.
- Cloud sync, accounts, AI/network classification, multi-user.
- Content-based semantic classification (reading document text).
- macOS/Linux packaging (code stays portable; only Windows is built and tested).

## Architecture

New repository at `C:\Users\xsv\Desktop\fathom\`. The Grok workspace is left untouched.

```
electron main process (Node, full fs access)
  engine/        pure TS modules, unit-tested, no Electron imports
    scan.ts        walk roots → FileEntry[] + ProtectedUnit[]
    hash.ts        duplicate detection (size → head hash → full hash)
    classify/      rules engine → proposed destination per item
    plan.ts        build/validate Plan (conflicts, preflight)
    apply.ts       execute Plan with write-ahead journal
    journal.ts     JSONL journal read/write, recovery
    undo.ts        reverse a journal
    settings.ts    user rules + preferences (JSON in userData)
  ipc.ts         typed handlers exposing the engine
  main.ts        window, menus, recovery check on launch
preload.ts       contextBridge: typed `window.fathom` API, nothing else
renderer (React + Vite + Tailwind, no Node access)
  screens: Home, Scanning, Studio (plan review), Applying, History, Rules
  store: zustand
```

The renderer never touches the filesystem. All engine calls go through
`window.fathom.*`, which returns plain serializable data. Long jobs (scan,
hash, apply, undo) stream progress events and accept cancellation.

## Data model

```ts
type FileEntry = {
  id: string;             // stable within a session
  root: string;           // absolute root the user picked
  rel: string;            // path relative to root, "/"-separated
  name: string; ext: string;
  size: number; mtimeMs: number; birthtimeMs: number;
  takenMs?: number;       // EXIF DateTimeOriginal for photos
  kind: Kind;             // document|spreadsheet|presentation|image|video|audio|code|archive|installer|data|design|font|ebook|other
  unitId?: string;        // set if inside a ProtectedUnit
  hash?: string;          // full hash, only computed for size-collision groups
  duplicateOf?: string;   // id of the kept copy
};

type ProtectedUnit = { id: string; rel: string; reason: string; size: number; fileCount: number };

type PlanItem = {
  source: { kind: "file" | "unit"; id: string };
  from: string;           // absolute
  to: string;             // absolute
  reason: string;         // human-readable rule that placed it ("Screenshot, 2023")
  locked: boolean;        // user-pinned destination
  excluded: boolean;      // user said "don't move"
};
```

## Scan

- User picks one or more root folders.
- Streaming walk with `fs.promises.opendir`; progress events every ~250 ms;
  cancellable.
- Skipped: hidden/system files (`desktop.ini`, `Thumbs.db`, `.DS_Store`,
  dot-files, Windows hidden/system attribute where readable), symlinks and
  junctions (never followed, never moved), `$RECYCLE.BIN`, `System Volume Information`.
- **Protected units:** a directory containing any marker (`.git`, `package.json`,
  `Cargo.toml`, `pyproject.toml`, `*.sln`, `*.csproj`, `go.mod`, `pom.xml`,
  `build.gradle`, `.xcodeproj`, `.app`, `node_modules`, `.venv`,
  `*.photoslibrary`, Unity/Unreal project files) is recorded as one unit and not
  descended into for classification. A unit moves as a whole into `Code/` (or
  stays, if excluded).
- EXIF `DateTimeOriginal` read (via `exifr`, header only) for jpg/jpeg/heic/tiff/
  raw formats; failures ignored.

## Duplicates

1. Group by exact size (skip 0-byte files and files < 1 KB as "not worth it").
2. Within groups of ≥2, hash first 64 KB (sha1).
3. Within still-matching groups, full-file sha1 streamed.
4. Keeper = the copy with the shallowest path, ties broken by oldest mtime.
   Others get `duplicateOf` and are planned into
   `<dest>/_Fathom Review/Duplicates/<original rel path>`.

Runs after scan with its own progress bar; can be skipped.

## Classification

Ordered pipeline; first match wins. Each step returns `{ area, project?, reason }`.
Final path: `<dest>/<Area>/<Project>/<name>` (project optional).

1. **User rules** (from settings), in user order. A rule has conditions
   (name contains / matches glob, extension in list, path contains, kind is,
   size range, older/newer than) and a target template supporting
   `{year}`, `{month}`, `{kind}`, `{ext}`, `{parent}`.
2. **Duplicates** → `_Fathom Review/Duplicates/...`.
3. **Protected units** → `Code/<unit folder name>`.
4. **Built-in rules:** screenshots (name patterns) → `Media/Screenshots/{year}`;
   installers (`.exe/.msi/.dmg/.pkg` in Downloads-like paths) → `Inbox/Installers`;
   taxes/W-2/1099 → `Finance/Taxes/{year}`; invoices/receipts/statements →
   `Finance/<meaningful folder or "Records">`; resume/CV → `Work/Resume`;
   photos/videos → `Media/<meaningful folder or "Photos"> {year}` using taken date;
   audio → `Media/Audio`; fonts → `Design/Fonts`; ebooks → `Library/Books`.
5. **Folder meaning:** the nearest ancestor folder whose name is not noise
   becomes the project; area is inferred from keywords in the path
   (work/school/personal/…) or falls back to kind (documents → `Documents`).
6. **Fallback:** `Inbox/Unsorted`.

Noise folder detection is a general heuristic, not the prototype's
sample-specific list: generic names (`new folder`, `untitled`, `stuff`, `misc`,
`old`, `backup`, `temp`, `final*`, `copy of *`, `v\d+`, `\d+`, user-profile
names such as `Desktop/Documents/Downloads`, single characters, names of only
repeated characters).

**Layouts** (selectable in Studio): Smart (above), By type
(`<Kind>/{year}`), By date (`{year}/{month}`), Flatten to N levels (2 or 3),
Keep in place. Switching layouts keeps locked/excluded items.

## Studio (plan review)

Reuses the prototype's look: before/after trees, depth sounding chart,
before/after depth, search, "The wreck" / "Terrace" panes, undo stack for plan
edits.

Adds:
- Lock (pin destination) and Exclude (don't move) on any file, folder, or unit.
- Drag files/folders between destination shelves; create/rename destination folders.
- Filters: moved, unchanged, duplicates, conflicts, excluded, protected units.
- Reason shown for every item ("Screenshot, 2023", "Rule: Invoices").
- Destination choice: organize in place (dest = root) or into another folder.
- Preflight panel (see Apply) must be green or acknowledged before Apply.
- Virtualized lists so 100k items stay smooth.

## Apply

**Preflight** (runs on demand and immediately before apply):
- Destination name collisions → auto-suffix ` (2)`, shown as warnings.
- Source still exists with same size/mtime as scanned; otherwise item flagged stale and skipped.
- Write permission on destination.
- Cross-volume moves: enough free space for the largest pending copy batch.
- Path length > 259 chars → use `\\?\` long-path prefix; flag if still invalid.
- Reserved Windows names/characters in generated folder names are sanitized.

**Execution** (`apply.ts`):
1. Create run folder `userData/runs/<runId>/` with `plan.json` and `journal.jsonl`.
2. For each item: append `{op:"intent", i, from, to}` → fsync → perform move →
   append `{op:"done", i}`. On error append `{op:"fail", i, error}` and continue.
3. Move = `fs.rename`; on `EXDEV` do copy → verify size+sha1 → rename temp into
   place → unlink source.
4. Destination directories created are journaled (`{op:"mkdir", path}`).
5. After moves, source directories left empty are removed bottom-up and
   journaled (`{op:"rmdir", path}`). Never removes a non-empty dir.
6. Final `{op:"end", summary}`.

Moves are sequential (single worker) to keep journal order exact; renames are
fast enough. Cancel stops after the current item and writes `end` with
`cancelled: true`.

**Recovery:** on launch, any run with no `end` record is offered: *Finish* (continue
from the first intent without done, checking whether the move actually happened)
or *Roll back* (undo done items).

## Undo

Reads a journal in reverse: recreate `rmdir`'d folders, move each `done` item from
`to` back to `from` (same EXDEV handling), then remove `mkdir`'d folders if empty.
If a file at `to` is missing or its size/mtime changed since the run, it is
reported and left alone; if `from` is now occupied, restore beside it with a
` (restored)` suffix. Undo writes its own journal so it is itself crash-safe.
A run can be undone once; History shows status (applied / partially undone / undone).

## Settings

`userData/settings.json`: user rules, default layout, duplicate policy on/off,
extra skip patterns, extra protected-unit markers, last-used roots. Rules editor
screen with add/reorder/test-against-current-scan.

## Error handling

- Per-file failures never abort a run; summary lists each with the OS error in
  plain words (in use, access denied, path too long, not found).
- Scan errors (unreadable dirs) are listed and skipped.
- All engine errors cross IPC as `{ code, message, path? }`, never raw stacks.
- UI never shows internal jargon; errors are phrased as what happened and what to do.

## Testing

- **vitest** unit tests on engine against temp directories:
  classification table tests, noise heuristic, protected-unit detection,
  duplicate detection, preflight collisions, apply + undo round-trip (tree equal
  before/after including empty folders), simulated crash (kill after N intents)
  then recover → finish and → rollback, EXDEV path via injected fs, stale sources.
- **Playwright (_electron)** smoke: launch packaged app, scan a fixture folder,
  apply, verify on disk, undo, verify restored.
- `tsc --noEmit` and eslint clean.

## Packaging

`electron-builder` → `release/Fathom-<ver>-portable.exe` and NSIS installer.
App icon from the prototype's mark. No auto-update, no telemetry.

## Carried over from the prototype

UI components (`studio`, `tree-pane`, `shelf-pane`, `plan-pane`, `depth-waveform`,
`landing`, `mark`, `file-glyph`, `ui/*`), styling tokens, `kind.ts`, tree building,
depth analysis, demo desk (kept as "Try with sample" — plan only, apply disabled).
Dropped: TanStack Start server, auth, database, PWA, multiplayer, zip export
(replaced by optional "Export plan as CSV").
