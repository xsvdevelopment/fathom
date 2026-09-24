import { useVirtualizer } from "@tanstack/react-virtual";
import { ArrowRight, Pin } from "lucide-react";
import { useMemo, useRef } from "react";
import type { Row } from "@shared/plan";
import { FileGlyph } from "@/components/fathom/file-glyph";
import { Badge } from "@/components/ui/badge";
import { clickSelect, startDrag } from "@/lib/selection";
import { cn } from "@/lib/utils";
import { useApp } from "@/store/app";

const COLS = "grid grid-cols-[minmax(12rem,1.1fr)_minmax(10rem,1.3fr)_1.25rem_minmax(10rem,1.3fr)_minmax(9rem,0.9fr)] gap-3";

/** Every item with where it is, where it's going, and why. Virtualized. */
export function MoveTable({ rows }: { rows: Row[] }) {
  const selected = useApp((s) => s.selected);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const order = useMemo(() => rows.map((r) => r.item.id), [rows]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const virt = useVirtualizer({ count: rows.length, getScrollElement: () => scrollRef.current, estimateSize: () => 34, overscan: 16 });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className={cn(COLS, "border-b border-border px-4 py-2 text-2xs font-medium tracking-wide text-muted-foreground uppercase")}>
        <span>File</span>
        <span>Now</span>
        <span />
        <span>After</span>
        <span>Why</span>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-sm text-muted-foreground">Nothing matches.</p>
      ) : (
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pb-24" data-testid="move-table">
          <div style={{ height: virt.getTotalSize(), position: "relative" }}>
            {virt.getVirtualItems().map((v) => {
              const r = rows[v.index]!;
              const sel = selectedSet.has(r.item.id);
              return (
                <div
                  key={r.item.id}
                  role="row"
                  draggable
                  onDragStart={(e) => startDrag(e, r.item.id)}
                  onClick={(e) => clickSelect(e, r.item.id, order)}
                  style={{ position: "absolute", top: 0, left: 0, right: 0, height: v.size, transform: `translateY(${v.start}px)` }}
                  className={cn(
                    COLS,
                    "cursor-pointer items-center border-b border-border/50 px-4 text-sm hover:bg-accent/60",
                    sel && "bg-accent",
                    r.excluded && "opacity-50",
                  )}
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <FileGlyph item={r.item} />
                    <span className={cn("truncate", r.item.type === "unit" && "text-sea")}>{r.item.name}</span>
                    {r.item.duplicateOf ? <Badge>copy</Badge> : null}
                  </span>
                  <span className="truncate font-mono text-2xs text-muted-foreground" title={r.item.rel}>
                    {r.item.rel}
                  </span>
                  <ArrowRight className={cn("size-3.5", r.moved ? "text-foreground" : "text-muted-foreground/30")} />
                  <span className={cn("truncate font-mono text-2xs", !r.moved && "text-muted-foreground")} title={r.newRel}>
                    {r.moved ? r.newRel : "stays"}
                  </span>
                  <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground" title={r.reason}>
                    {r.pinned ? <Pin className="size-3 shrink-0 text-primary" /> : null}
                    <span className="truncate">{r.reason}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
