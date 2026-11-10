# Fathom

A Windows desktop app that tidies deeply nested folders. Point it at a messy folder: it measures how deep
the mess goes, proposes a shallow tree that makes sense, lets you adjust it, and then moves the files.
Every run can be undone.

## Install

Fathom runs on Windows 10 and 11 (64-bit). Download one of these from the release page:

- `Fathom-Setup-<version>.exe` installs Fathom for your user account, with Start menu and desktop shortcuts.
- `Fathom-<version>-portable.exe` runs without installing.

The builds aren't code-signed yet, so Windows SmartScreen may show "Windows protected your PC" the first time.
Choose **More info**, then **Run anyway**.

## Using it

1. **Choose folders…** (or drop folders on the window). Fathom reads them. Scanning never changes anything.
2. **Review the plan.** The left side is how things are now; the right side is the proposed layout, or every
   single move with the reason for it. Switch layouts (Smart, By type, By date, Max 3/2 deep, Keep in place),
   drag files onto folders, pin a destination, or mark things "Don't move". Ctrl+Z undoes plan edits.
3. **Review & move.** Fathom re-checks every file against the disk, shows what it found, and asks for a clear yes.
4. **Undo** any run later from **History**.
5. **Re-assess** a folder Fathom sorted before, from **History** or with the **Re-assess sorted** switch in
   the plan. Files on Fathom's own shelves (Media, Documents, Inbox and the rest) are judged afresh, and a
   folder sitting on the wrong shelf moves whole to the right one. Folders you named stay in one piece, and
   nothing moves until you review the plan.

**Try the sample desk** shows a 40-folders-deep example without touching any files.

## Safety model

- **Nothing is deleted.** Exact duplicates (same bytes, checked by hash) go to `_Fathom Review/Duplicates/`,
  keeping their original folder structure. The copy that stays is the one with the original name, in a folder
  someone filed it in, over a "Copy of" or a stray on the Desktop.
- **Never overwrites.** Name clashes get ` (2)`; a file that appears at a target after the check is left alone.
- **Write-ahead journal.** Each move is recorded on disk *before* it happens. If the app or PC dies mid-run,
  the next launch offers to finish or roll back.
- **Projects move whole.** Folders with `.git`, `package.json`, `.sln`, Unity/Unreal/Xcode projects,
  app bundles and the like are never split. Fathom refuses to reorganize *inside* one.
- **System folders are off limits.** Windows, Program Files, ProgramData and AppData are refused.
- **Links are never followed** (symlinks, junctions).
- **Shortcuts stay put.** A `.lnk` or `.url` is only useful where you left it, so sorting never sweeps your
  desktop shortcuts into a folder. They move only with a folder that moves whole, or by a rule you wrote.
- **Undo is careful.** Files you edited after a run are left where they are; if something now occupies a
  file's old spot, the file comes back beside it as `name (restored).ext`.
- **Moves across drives** are copied, verified by size and SHA-1, and only then removed from the source.
- **Offline.** No network access, no telemetry.

## Rules

**Rules & settings** lets you add rules that run before Fathom's own judgment, top to bottom:
conditions (name contains, name pattern, extensions, path contains, kind, size, age) and a target like
`Finance/Invoices/{year}`. Tokens: `{year}` `{month}` `{kind}` `{ext}` `{parent}`.

## Where things live

`%APPDATA%\Fathom\` holds `settings.json` and `runs\<run id>\` (`plan.json`, `journal.jsonl`, `undo.jsonl`,
and `junk\` for the `desktop.ini`/`Thumbs.db` files cleared out of emptied folders so they can be restored).

## Development

```sh
npm install
npm run dev        # run with hot reload
npm test           # unit + engine tests (vitest, real temp folders)
npm run e2e        # build, then drive the app end to end with Playwright
npm run typecheck
npm run dist       # release/Fathom-Setup-<v>.exe and release/Fathom-<v>-portable.exe
```

`FATHOM_EXE=release/win-unpacked/Fathom.exe npx playwright test` runs the end-to-end test against the packaged app.

Layout: `src/shared` (pure logic: classification, rules, layouts, plan), `src/main/engine` (disk work:
scan, duplicates, preflight, apply, journal, undo, settings), `src/main/ipc.ts` + `src/preload` (typed bridge),
`src/renderer` (React UI). The window has no Node access; everything goes through `window.fathom`.

## License

MIT. See [LICENSE](LICENSE).

Built by XSV Development, with help from Claude.
