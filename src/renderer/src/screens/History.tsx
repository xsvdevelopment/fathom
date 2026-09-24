import { ArrowLeft, FolderOpen, NotebookText, RotateCcw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { RunInfo } from "@shared/types";
import { TitleBar } from "@/components/fathom/titlebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { folderName, formatCount, formatWhen, middleTruncate, plural } from "@/lib/utils";
import { useApp } from "@/store/app";

const STATUS: Record<RunInfo["status"], { label: string; variant: "default" | "ok" | "deep" | "solid" }> = {
  applied: { label: "Applied", variant: "ok" },
  undone: { label: "Undone", variant: "default" },
  incomplete: { label: "Interrupted", variant: "deep" },
  "partially-undone": { label: "Undo interrupted", variant: "deep" },
};

export function HistoryScreen() {
  const goto = useApp((s) => s.goto);
  const startJob = useApp((s) => s.startJob);
  const [runs, setRuns] = useState<RunInfo[] | null>(null);
  const [confirm, setConfirm] = useState<RunInfo | null>(null);

  useEffect(() => {
    void window.fathom.listRuns().then(setRuns);
  }, []);

  const run = async (r: RunInfo, how: "undo" | "finish") => {
    setConfirm(null);
    try {
      const { jobId } = how === "undo" ? await window.fathom.undo(r.runId) : await window.fathom.finish(r.runId);
      startJob({ jobId, runId: r.runId, kind: how, done: 0, total: 0, current: "", destRoot: r.destRoot });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start.");
    }
  };

  return (
    <div className="flex h-full flex-col">
      <TitleBar onHome={() => goto("home")} />
      <main className="mx-auto flex w-full max-w-4xl min-h-0 flex-1 flex-col px-8 pb-8">
        <div className="flex items-end justify-between py-6">
          <div>
            <Button variant="ghost" size="sm" className="-ml-3 mb-2" onClick={() => goto("home")}>
              <ArrowLeft />
              Back
            </Button>
            <h1 className="font-serif text-4xl tracking-tight">History</h1>
            <p className="mt-1 text-sm text-muted-foreground">Every run Fathom has made, and a way back from each one.</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {runs === null ? null : runs.length === 0 ? (
            <p className="rounded-xl bg-card p-8 text-center text-sm text-muted-foreground">No runs yet. When you move files, each run shows up here.</p>
          ) : (
            <ul className="flex flex-col gap-2" data-testid="runs">
              {runs.map((r) => {
                const s = STATUS[r.status];
                return (
                  <li key={r.runId} className="flex items-center gap-4 rounded-xl bg-card p-4 shadow-[0_0_0_1px_rgba(255,255,255,0.06)]">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium">{folderName(r.destRoot)}</p>
                        <Badge variant={s.variant}>{s.label}</Badge>
                      </div>
                      <p className="mt-0.5 truncate font-mono text-2xs text-muted-foreground">{middleTruncate(r.destRoot, 90)}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatWhen(r.at)} · {formatCount(r.moved)} of {plural(r.count, "item")} moved
                        {r.failed ? ` · ${formatCount(r.failed)} couldn't move` : ""}
                        {r.undoneAt ? ` · undone ${formatWhen(r.undoneAt)}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button variant="ghost" size="sm" onClick={() => void window.fathom.openPath(r.destRoot)} title="Open the folder">
                        <FolderOpen />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void window.fathom.runFolder(r.runId)} title="Open this run's record">
                        <NotebookText />
                      </Button>
                      {r.status === "incomplete" ? (
                        <Button size="sm" onClick={() => void run(r, "finish")}>
                          Finish
                        </Button>
                      ) : null}
                      {r.status !== "undone" ? (
                        <Button size="sm" variant="secondary" onClick={() => setConfirm(r)} data-testid="undo-run">
                          <RotateCcw />
                          {r.status === "partially-undone" ? "Finish undo" : "Undo"}
                        </Button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </main>

      <Dialog open={Boolean(confirm)} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Undo this run?</DialogTitle>
            <DialogDescription>
              {confirm ? `${plural(confirm.moved, "item")} will go back to where they were, and the empty folders Fathom cleared will come back.` : ""}
            </DialogDescription>
          </DialogHeader>
          <p className="mt-3 text-sm text-muted-foreground">
            Files you've edited since won't be touched. If something now sits where a file used to be, the file comes back beside it with
            "(restored)" in its name.
          </p>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setConfirm(null)}>
              Cancel
            </Button>
            <Button onClick={() => confirm && void run(confirm, "undo")} data-testid="confirm-undo">
              Undo run
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
