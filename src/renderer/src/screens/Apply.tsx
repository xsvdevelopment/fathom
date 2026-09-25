import { CircleCheck, FolderOpen, History, RotateCcw, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { RunSummary, UndoSummary } from "@shared/types";
import { TitleBar } from "@/components/fathom/titlebar";
import { Button } from "@/components/ui/button";
import { formatCount, middleTruncate, plural, errText } from "@/lib/utils";
import { useApp } from "@/store/app";

const VERB = { apply: "Moving files", undo: "Putting everything back", finish: "Finishing the interrupted run" } as const;

export function ApplyScreen() {
  const job = useApp((s) => s.job);
  const startJob = useApp((s) => s.startJob);
  const cancelJob = useApp((s) => s.cancelJob);
  const clearJob = useApp((s) => s.clearJob);
  const goto = useApp((s) => s.goto);
  if (!job) return null;

  const running = !job.result && !job.error;
  const pct = job.total ? Math.round((job.done / job.total) * 100) : 0;

  const done = () => {
    clearJob();
    useApp.setState({ items: [], roots: [] });
    goto("home");
  };

  const undoThis = async () => {
    if (!job.runId) return;
    try {
      const { jobId } = await window.fathom.undo(job.runId);
      startJob({ jobId, runId: job.runId, kind: "undo", done: 0, total: 0, current: "", destRoot: job.destRoot });
    } catch (err) {
      toast.error(errText(err, "Couldn't start the undo."));
    }
  };

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-8 pb-10">
        {running ? (
          <>
            <div className="stagger-in">
              <p className="mb-2 text-2xs font-medium tracking-[0.16em] text-muted-foreground uppercase">{VERB[job.kind]}</p>
              <p className="font-serif text-6xl tracking-tight tabular-nums">
                {formatCount(job.done)}
                <span className="text-muted-foreground"> / {job.total ? formatCount(job.total) : "…"}</span>
              </p>
            </div>
            <div>
              <div className="relative h-1 overflow-hidden rounded-full bg-muted">
                {job.total ? (
                  <div className="h-full rounded-full bg-sea transition-[width] duration-300" style={{ width: `${pct}%` }} />
                ) : (
                  <div className="indeterminate absolute inset-y-0 w-1/3 rounded-full bg-sea/80" />
                )}
              </div>
              <p className="mt-3 h-4 truncate font-mono text-2xs text-muted-foreground">{middleTruncate(job.current, 110)}</p>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="ghost" onClick={cancelJob}>
                Stop after this file
              </Button>
              <p className="text-xs text-muted-foreground">Every move is written down first, so stopping or even a crash is safe.</p>
            </div>
          </>
        ) : job.error ? (
          <div className="stagger-in">
            <p className="flex items-center gap-2 text-destructive">
              <TriangleAlert className="size-5" />
              {job.kind === "undo" ? "The undo couldn't run" : "The run couldn't finish"}
            </p>
            <p className="mt-2 text-muted-foreground">{job.error}</p>
            <p className="mt-2 text-sm text-muted-foreground">Anything that already moved is on record. Open History to finish or undo it.</p>
            <div className="mt-6 flex gap-2">
              <Button onClick={() => (clearJob(), goto("history"))}>
                <History />
                Open History
              </Button>
              <Button variant="ghost" onClick={done}>
                Back to start
              </Button>
            </div>
          </div>
        ) : job.kind === "undo" ? (
          <UndoResult result={job.result as UndoSummary} onDone={done} />
        ) : (
          <RunResult
            result={job.result as RunSummary}
            onOpen={() => job.destRoot && void window.fathom.openPath(job.destRoot)}
            onUndo={() => void undoThis()}
            onDone={done}
          />
        )}
      </main>
    </div>
  );
}

function RunResult({ result, onOpen, onUndo, onDone }: { result: RunSummary; onOpen: () => void; onUndo: () => void; onDone: () => void }) {
  return (
    <div className="stagger-in">
      <p className="flex items-center gap-2 text-ok">
        <CircleCheck className="size-5" />
        {result.cancelled ? "Stopped part-way" : "Done"}
      </p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">
        {plural(result.moved, "item")} moved{result.removedDirs ? `, ${plural(result.removedDirs, "empty folder")} cleared` : ""}.
      </h1>
      <p className="mt-3 text-muted-foreground">
        Nothing was deleted. {result.cancelled ? "The rest stayed where they were. " : ""}If anything looks wrong, you can undo the whole run
        here or later from History.
      </p>
      {result.failed.length ? (
        <details className="mt-5 rounded-lg bg-muted/60 p-3" open={result.failed.length <= 5}>
          <summary className="cursor-pointer text-sm text-warn">{plural(result.failed.length, "item")} couldn't move and stayed put</summary>
          <ul className="mt-2 flex max-h-56 flex-col gap-2 overflow-y-auto">
            {result.failed.slice(0, 200).map((f) => (
              <li key={f.from} className="text-xs">
                <button type="button" className="font-mono text-left hover:underline" onClick={() => void window.fathom.reveal(f.from)}>
                  {middleTruncate(f.from, 90)}
                </button>
                <p className="text-muted-foreground">{f.error}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="mt-8 flex flex-wrap gap-2">
        <Button onClick={onOpen}>
          <FolderOpen />
          Open the folder
        </Button>
        <Button variant="secondary" onClick={onUndo} disabled={!result.moved}>
          <RotateCcw />
          Undo this run
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Back to start
        </Button>
      </div>
    </div>
  );
}

function UndoResult({ result, onDone }: { result: UndoSummary; onDone: () => void }) {
  return (
    <div className="stagger-in">
      <p className="flex items-center gap-2 text-ok">
        <CircleCheck className="size-5" />
        {result.cancelled ? "Stopped part-way" : "Undone"}
      </p>
      <h1 className="mt-2 font-serif text-5xl tracking-tight">
        {plural(result.restored, "item")} back where {result.restored === 1 ? "it was" : "they were"}.
      </h1>
      {result.skipped.length ? (
        <details className="mt-5 rounded-lg bg-muted/60 p-3" open>
          <summary className="cursor-pointer text-sm text-warn">{plural(result.skipped.length, "item")} left where they are</summary>
          <ul className="mt-2 flex max-h-56 flex-col gap-2 overflow-y-auto">
            {result.skipped.slice(0, 200).map((s) => (
              <li key={s.path} className="text-xs">
                <button type="button" className="font-mono text-left hover:underline" onClick={() => void window.fathom.reveal(s.path)}>
                  {middleTruncate(s.path, 90)}
                </button>
                <p className="text-muted-foreground">{s.reason}</p>
              </li>
            ))}
          </ul>
        </details>
      ) : result.cancelled ? null : (
        <p className="mt-3 text-muted-foreground">Every file and folder is back, including the empty folders Fathom had cleared.</p>
      )}
      {result.cancelled ? (
        <p className="mt-3 text-muted-foreground">The rest are still in the new layout. Open History to finish the undo.</p>
      ) : null}
      <div className="mt-8">
        <Button onClick={onDone}>Back to start</Button>
      </div>
    </div>
  );
}
