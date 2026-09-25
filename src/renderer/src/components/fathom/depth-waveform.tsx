import { cn, formatCount } from "@/lib/utils";

type DepthWaveformProps = {
  byDepth: number[];
  proposedByDepth?: number[];
  onSelectDepth?: (depth: number) => void;
  compact?: boolean;
  label?: string;
};

/** Bars of file counts per folder depth; red from 6 levels down. Optional overlay shows the proposed tree. */
export function DepthWaveform({ byDepth, proposedByDepth, onSelectDepth, compact = false, label = "Depth sounding" }: DepthWaveformProps) {
  const maxDepth = Math.max(0, byDepth.length - 1);
  const cols = Math.max(byDepth.length, proposedByDepth?.length ?? 0, 16);
  const peak = Math.max(1, ...byDepth, ...(proposedByDepth ?? []));

  return (
    <div className={cn("flex flex-col", compact ? "gap-1.5" : "gap-3")}>
      <div className="flex items-end justify-between gap-4">
        <p className="text-2xs font-medium tracking-[0.14em] text-muted-foreground uppercase">{label}</p>
        <p className="font-mono text-2xs text-muted-foreground tabular-nums">0 to {formatCount(maxDepth)} folders deep</p>
      </div>
      <div
        className={cn("flex items-end gap-px", compact ? "h-14" : "h-24")}
        role="img"
        aria-label={`File counts by folder depth, deepest ${maxDepth}`}
      >
        {Array.from({ length: cols }, (_, depth) => {
          const count = byDepth[depth] ?? 0;
          const after = proposedByDepth?.[depth] ?? 0;
          const h = count === 0 ? 2 : Math.max(4, Math.round((Math.log1p(count) / Math.log1p(peak)) * 100));
          const h2 = after === 0 ? 0 : Math.max(3, Math.round((Math.log1p(after) / Math.log1p(peak)) * 100));
          return (
            <button
              key={depth}
              type="button"
              title={`${formatCount(count)} files ${depth} folders deep${proposedByDepth ? ` · ${formatCount(after)} after` : ""}`}
              onClick={() => onSelectDepth?.(depth)}
              disabled={!onSelectDepth}
              className="relative flex min-w-0 flex-1 flex-col items-center justify-end self-stretch rounded-sm focus-visible:ring-2 focus-visible:ring-ring/70 focus-visible:outline-none disabled:cursor-default"
            >
              <span
                className={cn(
                  "block w-full rounded-sm transition-[height] duration-500 ease-out",
                  depth >= 6 ? "bg-destructive/75" : "bg-foreground/30",
                  count === 0 && "bg-foreground/10",
                )}
                style={{ height: `${h}%` }}
              />
              {proposedByDepth ? (
                <span
                  className="absolute bottom-0 w-full rounded-sm bg-sea/85 transition-[height] duration-500 ease-out"
                  style={{ height: `${h2}%` }}
                />
              ) : null}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between font-mono text-mini text-muted-foreground/80">
        <span>surface</span>
        {proposedByDepth ? (
          <span className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-foreground/30" />
              now
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-sea/85" />
              after
            </span>
          </span>
        ) : null}
        <span>the well</span>
      </div>
    </div>
  );
}
