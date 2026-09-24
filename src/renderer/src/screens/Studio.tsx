import {
  ArrowRightLeft,
  Ban,
  Check,
  Download,
  FolderInput,
  FolderOpen,
  HardDrive,
  Pin,
  RotateCcw,
  Search,
  Undo2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { LAYOUT_LABEL, REVIEW_DIR } from "@shared/layouts";
import { joinAbs, planCsv } from "@shared/plan";
import type { Layout } from "@shared/types";
import { DepthWaveform } from "@/components/fathom/depth-waveform";
import { MoveTable } from "@/components/fathom/move-table";
import { MoveToDialog } from "@/components/fathom/move-to-dialog";
import { ReviewDialog } from "@/components/fathom/review-dialog";
import { TitleBar } from "@/components/fathom/titlebar";
import { TreeView } from "@/components/fathom/tree-view";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { usePlan } from "@/lib/use-plan";
import { cn, folderName, formatBytes, formatCount, middleTruncate, plural } from "@/lib/utils";
import { useApp, type Filter } from "@/store/app";

const LAYOUTS: Layout[] = ["smart", "type", "date", "flat3", "flat2", "inplace"];
const FILTER_LABEL: Record<Filter, string> = {
  all: "Everything",
  moving: "Moving",
  staying: "Staying",
  duplicates: "Copies",
  projects: "Projects",
  pinned: "Placed by you",
  excluded: "Excluded",
};

export function Studio() {
  const plan = usePlan();
  const roots = useApp((s) => s.roots);
  const sample = useApp((s) => s.sample);
  const layout = useApp((s) => s.layout);
  const setLayout = useApp((s) => s.setLayout);
  const query = useApp((s) => s.query);
  const setQuery = useApp((s) => s.setQuery);
  const filter = useApp((s) => s.filter);
  const setFilter = useApp((s) => s.setFilter);
  const selected = useApp((s) => s.selected);
  const setSelected = useApp((s) => s.setSelected);
  const moveTo = useApp((s) => s.moveTo);
  const togglePin = useApp((s) => s.togglePin);
  const setExcluded = useApp((s) => s.setExcluded);
  const undoEdit = useApp((s) => s.undoEdit);
  const history = useApp((s) => s.history);
  const resetEdits = useApp((s) => s.resetEdits);
  const destRoot = useApp((s) => s.destRoot);
  const setDestRoot = useApp((s) => s.setDestRoot);
  const goto = useApp((s) => s.goto);
  const errors = useApp((s) => s.scan.errors);
  const [moveOpen, setMoveOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const initialAfter = useMemo(() => [...new Set(plan.rows.map((r) => r.newRel.split("/")[0]!))], []); // eslint-disable-line react-hooks/exhaustive-deps
  const edited = history.length > 0;
  const selRows = useMemo(() => selected.map((id) => plan.byId.get(id)).filter(Boolean), [selected, plan.byId]);
  const allExcluded = selRows.length > 0 && selRows.every((r) => r!.excluded);
  const allPinned = selRows.length > 0 && selRows.every((r) => r!.pinned);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.tagName === "INPUT";
      if (e.ctrlKey && e.key.toLowerCase() === "z" && !typing) {
        e.preventDefault();
        undoEdit();
      } else if (e.ctrlKey && e.key.toLowerCase() === "f") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.ctrlKey && e.key.toLowerCase() === "a" && !typing) {
        e.preventDefault();
        setSelected(plan.visible.map((r) => r.item.id));
      } else if (e.key === "Escape" && !typing) {
        setSelected([], null);
      } else if (e.key.toLowerCase() === "m" && !typing && !e.ctrlKey && useApp.getState().selected.length) {
        setMoveOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undoEdit, setSelected, plan.visible]);

  const chooseDest = async () => {
    const p = await window.fathom.pickFolder();
    if (p) setDestRoot(p);
  };

  const exportCsv = async () => {
    const name = `fathom-plan-${new Date().toISOString().slice(0, 10)}.csv`;
    const saved = await window.fathom.exportCsv(planCsv(plan.rows, destRoot || roots[0] || ""), name);
    if (saved) toast.success("Plan exported", { description: saved });
  };

  const leave = () => (edited ? setLeaveOpen(true) : goto("home"));
  const moving = plan.counts.moving;

  return (
    <div className="flex h-full flex-col">
      <TitleBar onHome={leave}>
        <Badge className="max-w-72 truncate" title={roots.join("\n")}>
          {roots.length === 1 ? folderName(roots[0]!) : plural(roots.length, "folder")}
        </Badge>
        {sample ? <Badge variant="solid">sample</Badge> : null}
        <span className="hidden font-mono text-2xs text-muted-foreground tabular-nums xl:inline">
          {formatCount(plan.rows.length)} items · {formatCount(plan.counts.duplicates)} copies · {formatCount(plan.counts.projects)} projects
        </span>
        {errors.length ? (
          <Badge variant="deep" title={errors.slice(0, 20).map((e) => `${e.path}: ${e.message}`).join("\n")}>
            {plural(errors.length, "folder")} unreadable
          </Badge>
        ) : null}
      </TitleBar>

      <header className="flex flex-col gap-3 border-b border-border px-5 pt-1 pb-3">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
          <div className="min-w-0 flex-1">
            <DepthWaveform compact byDepth={plan.before.byDepth} proposedByDepth={plan.after.byDepth} />
          </div>
          <div className="flex items-stretch gap-2">
            <div className="flex items-center gap-3 rounded-lg bg-muted px-4 py-2">
              <div>
                <p className="text-mini tracking-[0.12em] text-muted-foreground uppercase">Deepest now</p>
                <p className="font-serif text-2xl leading-none tabular-nums">{plan.before.maxDepth}</p>
              </div>
              <span className="text-muted-foreground">→</span>
              <div>
                <p className="text-mini tracking-[0.12em] text-muted-foreground uppercase">After</p>
                <p className="font-serif text-2xl leading-none text-sea tabular-nums">{plan.after.maxDepth}</p>
              </div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex max-w-72 flex-col items-start justify-center rounded-lg bg-muted px-4 py-2 text-left hover:bg-accent"
                  disabled={sample}
                >
                  <span className="text-mini tracking-[0.12em] text-muted-foreground uppercase">Tidy into</span>
                  <span className={cn("flex max-w-full items-center gap-1.5 truncate text-sm", !destRoot && "text-warn")}>
                    <HardDrive className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{destRoot ? folderName(destRoot) : "Choose a folder"}</span>
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-80">
                <DropdownMenuLabel>Where the new layout goes</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {roots.map((r) => (
                  <DropdownMenuItem key={r} onSelect={() => setDestRoot(r)}>
                    {destRoot === r ? <Check /> : <FolderOpen />}
                    <span className="min-w-0">
                      <span className="block">In place: {folderName(r)}</span>
                      <span className="block truncate font-mono text-2xs text-muted-foreground">{r}</span>
                    </span>
                  </DropdownMenuItem>
                ))}
                <DropdownMenuItem onSelect={() => void chooseDest()}>
                  <FolderInput />
                  Another folder…
                </DropdownMenuItem>
                {destRoot && !roots.includes(destRoot) ? (
                  <p className="px-2 py-1.5 font-mono text-2xs text-muted-foreground">{middleTruncate(destRoot, 60)}</p>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-muted p-1" role="radiogroup" aria-label="Layout">
            {LAYOUTS.map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={layout === l}
                onClick={() => setLayout(l)}
                className={cn(
                  "h-8 rounded-md px-3 text-xs font-medium whitespace-nowrap text-muted-foreground transition-colors hover:text-foreground",
                  layout === l && "bg-card text-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.06)]",
                )}
              >
                {LAYOUT_LABEL[l]}
              </button>
            ))}
          </div>
          <div className="relative w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search  (Ctrl+F)"
              className="h-10 pl-9"
              aria-label="Search files"
            />
          </div>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={undoEdit} disabled={!edited} title="Undo last change (Ctrl+Z)">
              <Undo2 />
              Undo
            </Button>
            {edited ? (
              <Button variant="ghost" size="sm" onClick={resetEdits} title="Drop everything you placed or excluded by hand">
                <RotateCcw />
                Reset
              </Button>
            ) : null}
            <Button variant="ghost" size="sm" onClick={() => void exportCsv()}>
              <Download />
              CSV
            </Button>
            <Button size="sm" onClick={() => setReviewOpen(true)} disabled={!moving} data-testid="review-apply">
              <ArrowRightLeft />
              Review &amp; move {moving ? formatCount(moving) : ""}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(FILTER_LABEL) as Filter[]).map((f) =>
            f === "all" || plan.counts[f] > 0 ? (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(filter === f ? "all" : f)}
                className={cn(
                  "flex h-7 items-center gap-1.5 rounded-full px-3 text-xs text-muted-foreground shadow-[0_0_0_1px_rgba(255,255,255,0.08)] hover:text-foreground",
                  filter === f && "bg-primary text-primary-foreground shadow-none hover:text-primary-foreground",
                )}
              >
                {FILTER_LABEL[f]}
                <span className="font-mono text-mini tabular-nums opacity-70">{formatCount(plan.counts[f])}</span>
              </button>
            ) : null,
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {formatBytes(plan.bytesMoving)} moving · copies go to <span className="font-mono">{REVIEW_DIR}</span>
          </span>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(18rem,34%)_1fr]">
        <section className="flex min-h-0 flex-col border-r border-border">
          <div className="flex items-baseline justify-between px-4 py-3">
            <div>
              <h2 className="text-sm font-medium">Now</h2>
              <p className="text-xs text-muted-foreground">Where things are today. Red folders run 8+ deep.</p>
            </div>
          </div>
          <div className="min-h-0 flex-1">
            <TreeView rows={plan.visible} byId={plan.byId} side="before" initialOpen={[]} empty="Nothing matches." />
          </div>
        </section>

        <Tabs defaultValue="after" className="flex min-h-0 flex-col">
          <div className="flex items-center justify-between gap-3 px-4 py-2">
            <TabsList className="h-10">
              <TabsTrigger value="after" className="h-8">
                New layout
              </TabsTrigger>
              <TabsTrigger value="moves" className="h-8">
                Every move
              </TabsTrigger>
            </TabsList>
            <p className="text-xs text-muted-foreground">Drag files onto a folder to place them. Alt-click a folder to open all.</p>
          </div>
          <TabsContent value="after" className="min-h-0 flex-1">
            <TreeView rows={plan.visible} byId={plan.byId} side="after" initialOpen={initialAfter} empty="Nothing matches." />
          </TabsContent>
          <TabsContent value="moves" className="min-h-0 flex-1">
            <MoveTable rows={plan.visible} />
          </TabsContent>
        </Tabs>
      </div>

      {selected.length ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-5 z-30 flex justify-center">
          <div className="stagger-in pointer-events-auto flex items-center gap-1 rounded-xl bg-card p-1.5 shadow-[0_0_0_1px_rgba(255,255,255,0.1),0_12px_40px_rgba(0,0,0,0.5)]">
            <span className="px-3 text-sm tabular-nums">{plural(selected.length, "selected", "selected")}</span>
            <Button size="sm" variant="secondary" onClick={() => setMoveOpen(true)} title="Move to… (M)">
              <FolderInput />
              Move to…
            </Button>
            <Button size="sm" variant="ghost" onClick={() => togglePin(selected)} title="Keep this destination even when you switch layouts">
              <Pin />
              {allPinned ? "Unpin" : "Pin"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setExcluded(selected, !allExcluded)}>
              <Ban />
              {allExcluded ? "Include" : "Don't move"}
            </Button>
            {selected.length === 1 && !sample ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  const r = plan.byId.get(selected[0]!);
                  if (r) void window.fathom.reveal(joinAbs(r.item.root, r.item.rel));
                }}
              >
                <FolderOpen />
                Show
              </Button>
            ) : null}
            <Button size="icon" variant="ghost" className="size-9" onClick={() => setSelected([], null)} title="Clear selection (Esc)">
              <X />
            </Button>
          </div>
        </div>
      ) : null}

      <MoveToDialog open={moveOpen} onOpenChange={setMoveOpen} rows={plan.rows} count={selected.length} onPick={(d) => moveTo(selected, d)} />
      <ReviewDialog open={reviewOpen} onOpenChange={setReviewOpen} rows={plan.rows} />

      <Dialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave this plan?</DialogTitle>
            <DialogDescription>Your hand-placed files and exclusions will be lost. Nothing on disk has changed.</DialogDescription>
          </DialogHeader>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setLeaveOpen(false)}>
              Stay
            </Button>
            <Button onClick={() => (setLeaveOpen(false), goto("home"))}>Leave</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
