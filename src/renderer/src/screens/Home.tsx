import { ArrowRight, FolderOpen, History, RotateCcw, Settings2, Sparkles, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { buildDemoItems } from "@shared/demo";
import { depthStats } from "@shared/tree";
import type { RootCheck, RunInfo } from "@shared/types";
import { DepthWaveform } from "@/components/fathom/depth-waveform";
import { TitleBar } from "@/components/fathom/titlebar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { vetRoots } from "@/lib/pick";
import { cn, folderName, formatCount, formatWhen, middleTruncate, plural } from "@/lib/utils";
import { useApp } from "@/store/app";

export function Home() {
  const settings = useApp((s) => s.settings);
  const startScan = useApp((s) => s.startScan);
  const loadSample = useApp((s) => s.loadSample);
  const goto = useApp((s) => s.goto);
  const startJob = useApp((s) => s.startJob);
  const [runs, setRuns] = useState<RunInfo[]>([]);
  const [dragging, setDragging] = useState(false);
  const [warn, setWarn] = useState<{ checks: RootCheck[]; resolve: (ok: boolean) => void } | null>(null);
  const depth = useRef(0);

  useEffect(() => {
    void window.fathom.listRuns().then(setRuns);
  }, []);

  const sample = useMemo(() => depthStats(buildDemoItems().map((i) => i.rel)), []);
  const stuck = runs.filter((r) => r.status === "incomplete" || r.status === "partially-undone");
  const recentRuns = runs.filter((r) => r.status === "applied").slice(0, 3);

  const confirmWarn = (checks: RootCheck[]) => new Promise<boolean>((resolve) => setWarn({ checks, resolve }));

  const begin = async (roots: string[]) => {
    const ok = await vetRoots(roots, confirmWarn);
    if (ok.length) await startScan(ok);
  };

  const choose = async () => begin(await window.fathom.pickFolders());

  const recover = async (run: RunInfo, how: "finish" | "undo") => {
    try {
      const { jobId } = how === "finish" ? await window.fathom.finish(run.runId) : await window.fathom.undo(run.runId);
      startJob({ jobId, kind: how, runId: run.runId, done: 0, total: 0, current: "", destRoot: run.destRoot });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start.");
    }
  };

  return (
    <div
      className="relative flex h-full flex-col"
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        depth.current += 1;
        setDragging(true);
      }}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (!depth.current) setDragging(false);
      }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        const paths = [...e.dataTransfer.files].map((f) => window.fathom.pathForFile(f)).filter(Boolean);
        void begin(paths);
      }}
    >
      <TitleBar />

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-12 overflow-y-auto px-8 pb-10 lg:flex-row lg:items-center lg:gap-16">
        <div className="max-w-xl">
          <p className="stagger-in mb-4 text-2xs font-medium tracking-[0.16em] text-muted-foreground uppercase">Filing studio</p>
          <h1 className="stagger-in font-serif text-5xl leading-[1.05] tracking-tight lg:text-6xl">
            Forty folders deep is not a filing system.
          </h1>
          <p className="stagger-in delay-1 mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
            Point Fathom at a messy folder. It measures how deep the mess goes, proposes a shallow tree that makes sense,
            and moves your files when you say so. Nothing is ever deleted, and every run can be undone.
          </p>

          {stuck.length ? (
            <div className="stagger-in delay-1 mt-6 flex flex-col gap-2">
              {stuck.map((r) => (
                <div key={r.runId} className="rounded-lg bg-warn/10 p-3 shadow-[0_0_0_1px_color-mix(in_oklab,var(--color-warn)_30%,transparent)]">
                  <p className="flex items-center gap-2 text-sm font-medium text-warn">
                    <TriangleAlert className="size-4" />
                    {r.status === "incomplete" ? "A run was interrupted" : "An undo was interrupted"}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatWhen(r.at)} · {plural(r.moved, "file")} moved in {middleTruncate(r.destRoot, 50)}. Every move
                    is on record, so you can pick up where it stopped.
                  </p>
                  <div className="mt-2 flex gap-2">
                    {r.status === "incomplete" ? (
                      <Button size="sm" onClick={() => void recover(r, "finish")}>
                        Finish the run
                      </Button>
                    ) : null}
                    <Button size="sm" variant="secondary" onClick={() => void recover(r, "undo")}>
                      <RotateCcw />
                      {r.status === "incomplete" ? "Roll it back" : "Finish the undo"}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          <div className="stagger-in delay-2 mt-8 flex flex-wrap gap-3">
            <Button size="lg" onClick={() => void choose()} data-testid="choose-folders">
              <FolderOpen />
              Choose folders…
            </Button>
            <Button size="lg" variant="secondary" onClick={loadSample}>
              <Sparkles />
              Try the sample desk
            </Button>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Or drop folders anywhere on this window.</p>

          {settings?.recentRoots.length ? (
            <div className="mt-8">
              <p className="mb-2 text-2xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Recent</p>
              <div className="flex flex-col gap-1">
                {settings.recentRoots.slice(0, 5).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => void begin([r])}
                    className="group flex items-center gap-3 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <FolderOpen className="size-4 text-muted-foreground" strokeWidth={1.75} />
                    <span className="font-medium">{folderName(r)}</span>
                    <span className="min-w-0 flex-1 truncate font-mono text-2xs text-muted-foreground">{r}</span>
                    <ArrowRight className="size-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <aside className="stagger-in delay-2 w-full max-w-md shrink-0 rounded-xl bg-card p-5 shadow-[0_0_0_1px_rgba(255,255,255,0.08)]">
          {recentRuns.length ? (
            <>
              <p className="mb-3 text-2xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Recent runs</p>
              <ul className="flex flex-col gap-3">
                {recentRuns.map((r) => (
                  <li key={r.runId} className="flex items-baseline justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{folderName(r.destRoot)}</p>
                      <p className="text-xs text-muted-foreground">{formatWhen(r.at)}</p>
                    </div>
                    <p className="shrink-0 font-mono text-xs text-muted-foreground tabular-nums">{formatCount(r.moved)} moved</p>
                  </li>
                ))}
              </ul>
              <Button variant="ghost" size="sm" className="mt-4 -ml-3" onClick={() => goto("history")}>
                <History />
                All runs and undo
              </Button>
            </>
          ) : (
            <>
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <p className="text-2xs font-medium tracking-[0.14em] text-muted-foreground uppercase">Sample desk</p>
                  <p className="font-serif text-5xl leading-none tracking-tight tabular-nums">{sample.maxDepth}</p>
                  <p className="mt-1 text-sm text-muted-foreground">folders down to a buried tax return</p>
                </div>
              </div>
              <DepthWaveform byDepth={sample.byDepth} />
            </>
          )}
        </aside>
      </main>

      <footer className="flex items-center justify-between gap-4 border-t border-border px-6 py-3 text-xs text-muted-foreground">
        <p>0 files deleted. Everything Fathom does is on record and can be undone.</p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={() => goto("history")}>
            <History />
            History
          </Button>
          <Button variant="ghost" size="sm" onClick={() => goto("rules")}>
            <Settings2 />
            Rules &amp; settings
          </Button>
          <span className="ml-2 font-mono text-mini">v{window.fathom.version}</span>
        </div>
      </footer>

      <div
        className={cn(
          "pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-background/85 transition-opacity duration-200",
          dragging ? "opacity-100" : "opacity-0",
        )}
      >
        <p className="font-serif text-3xl tracking-tight">Drop folders to sound them</p>
      </div>

      <Dialog open={Boolean(warn)} onOpenChange={(o) => !o && (warn?.resolve(false), setWarn(null))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>That's a big folder</DialogTitle>
            <DialogDescription>Fathom can handle it, but make sure it's what you meant.</DialogDescription>
          </DialogHeader>
          <ul className="mt-3 flex flex-col gap-2 text-sm">
            {warn?.checks.map((c) => (
              <li key={c.root}>
                <p className="font-mono text-xs">{c.root}</p>
                <p className="text-muted-foreground">{c.message}</p>
              </li>
            ))}
          </ul>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => (warn?.resolve(false), setWarn(null))}>
              Pick something else
            </Button>
            <Button onClick={() => (warn?.resolve(true), setWarn(null))}>Scan it anyway</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
