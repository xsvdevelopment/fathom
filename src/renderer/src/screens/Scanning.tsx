import { TitleBar } from "@/components/fathom/titlebar";
import { Button } from "@/components/ui/button";
import { formatBytes, formatCount, middleTruncate, plural } from "@/lib/utils";
import { useApp } from "@/store/app";

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-2xs font-medium tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
      <p className="font-serif text-4xl leading-tight tracking-tight tabular-nums">{value}</p>
    </div>
  );
}

export function Scanning() {
  const scan = useApp((s) => s.scan);
  const roots = useApp((s) => s.roots);
  const cancelScan = useApp((s) => s.cancelScan);
  const skipDupes = useApp((s) => s.skipDupes);
  const dupes = scan.phase === "dupes";
  const pct = scan.total ? Math.round((scan.done / scan.total) * 100) : 0;

  return (
    <div className="flex h-full flex-col">
      <TitleBar />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-10 px-8">
        <div className="stagger-in">
          <p className="mb-2 text-2xs font-medium tracking-[0.16em] text-muted-foreground uppercase">
            {dupes ? "Looking for exact copies" : "Sounding"}
          </p>
          <h1 className="font-serif text-4xl tracking-tight">
            {dupes ? "Comparing files that could be copies of each other…" : `Reading ${roots.length > 1 ? plural(roots.length, "folder") : "your folder"}…`}
          </h1>
          <p className="mt-2 font-mono text-xs text-muted-foreground">{roots.map((r) => middleTruncate(r, 70)).join("  ·  ")}</p>
        </div>

        <div className="stagger-in delay-1 grid grid-cols-3 gap-6">
          <Stat label="Files" value={formatCount(scan.files)} />
          <Stat label="Folders" value={formatCount(scan.dirs)} />
          <Stat label="Size" value={formatBytes(scan.bytes)} />
        </div>

        <div className="stagger-in delay-2">
          <div className="relative h-1 overflow-hidden rounded-full bg-muted">
            {dupes && scan.total ? (
              <div className="h-full rounded-full bg-sea transition-[width] duration-300" style={{ width: `${pct}%` }} />
            ) : (
              <div className="indeterminate absolute inset-y-0 w-1/3 rounded-full bg-sea/80" />
            )}
          </div>
          <p className="mt-3 h-4 truncate font-mono text-2xs text-muted-foreground">
            {dupes
              ? scan.total
                ? `${formatCount(scan.done)} of ${formatCount(scan.total)} candidates checked`
                : "Grouping files by size…"
              : middleTruncate(scan.current, 110)}
          </p>
        </div>

        <div className="flex gap-2">
          {dupes ? (
            <Button variant="secondary" onClick={skipDupes}>
              Skip the copy check
            </Button>
          ) : null}
          <Button variant="ghost" onClick={cancelScan}>
            Cancel
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Scanning only reads. Nothing moves until you review the plan and say so.</p>
      </main>
    </div>
  );
}
