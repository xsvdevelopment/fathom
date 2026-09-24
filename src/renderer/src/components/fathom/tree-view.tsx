import { useVirtualizer } from "@tanstack/react-virtual";
import { ChevronRight, Folder, FolderInput, FolderOpen, Pin } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { Row } from "@shared/plan";
import { buildTree, type TreeNode } from "@shared/tree";
import { FileGlyph } from "@/components/fathom/file-glyph";
import { Badge } from "@/components/ui/badge";
import { clickSelect, DRAG_TYPE, droppedIds, startDrag } from "@/lib/selection";
import { cn, formatBytes, formatCount } from "@/lib/utils";
import { useApp } from "@/store/app";

type Line = { kind: "dir"; node: TreeNode; depth: number } | { kind: "file"; node: TreeNode; depth: number; row: Row };

type TreeViewProps = {
  rows: Row[];
  byId: Map<string, Row>;
  side: "before" | "after";
  /** Folder paths expanded on first render. */
  initialOpen: string[];
  empty: string;
};

/** A virtualized folder tree of either the current paths ("before") or the proposed ones ("after"). */
export function TreeView({ rows, byId, side, initialOpen, empty }: TreeViewProps) {
  const selected = useApp((s) => s.selected);
  const moveTo = useApp((s) => s.moveTo);
  const [open, setOpen] = useState(() => new Set(initialOpen));
  const [dropOn, setDropOn] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const root = useMemo(
    () => buildTree(rows.map((r) => ({ id: r.item.id, path: side === "before" ? r.item.rel : r.newRel, size: r.item.size }))),
    [rows, side],
  );

  const lines = useMemo(() => {
    const out: Line[] = [];
    const walk = (node: TreeNode, depth: number) => {
      for (const c of node.children) {
        if (c.isDir) {
          out.push({ kind: "dir", node: c, depth });
          if (open.has(c.path)) walk(c, depth + 1);
        } else {
          const row = byId.get(c.id!);
          if (row) out.push({ kind: "file", node: c, depth, row });
        }
      }
    };
    walk(root, 0);
    return out;
  }, [root, open, byId]);

  const order = useMemo(() => lines.flatMap((l) => (l.kind === "file" ? [l.row.item.id] : [])), [lines]);

  const virt = useVirtualizer({
    count: lines.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 30,
    overscan: 16,
  });

  const toggle = (path: string, deep = false) =>
    setOpen((prev) => {
      const next = new Set(prev);
      const opening = !next.has(path);
      const apply = (p: string) => (opening ? next.add(p) : next.delete(p));
      apply(path);
      if (deep) {
        const find = (n: TreeNode): TreeNode | undefined => (n.path === path ? n : n.children.map(find).find(Boolean));
        const walk = (n: TreeNode) => n.children.forEach((c) => c.isDir && (apply(c.path), walk(c)));
        const hit = find(root);
        if (hit) walk(hit);
      }
      return next;
    });

  if (!lines.length) return <p className="px-4 py-8 text-sm text-muted-foreground">{empty}</p>;

  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-2 pb-24" data-testid={`tree-${side}`}>
      <div style={{ height: virt.getTotalSize(), position: "relative" }}>
        {virt.getVirtualItems().map((v) => {
          const line = lines[v.index]!;
          const pad = 8 + Math.min(line.depth, 14) * 14;
          const style = { position: "absolute" as const, top: 0, left: 0, right: 0, height: v.size, transform: `translateY(${v.start}px)` };

          if (line.kind === "dir") {
            const n = line.node;
            const isOpen = open.has(n.path);
            const deep = side === "before" && n.maxDepth >= 8;
            const FolderIcon = dropOn === n.path ? FolderInput : isOpen ? FolderOpen : Folder;
            return (
              <button
                key={`d:${n.path}`}
                type="button"
                style={{ ...style, paddingLeft: pad }}
                onClick={(e) => toggle(n.path, e.altKey)}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes(DRAG_TYPE)) return;
                  e.preventDefault();
                  setDropOn(n.path);
                }}
                onDragLeave={() => setDropOn((d) => (d === n.path ? null : d))}
                onDrop={(e) => {
                  e.preventDefault();
                  setDropOn(null);
                  moveTo(droppedIds(e), n.path);
                }}
                title={side === "after" ? `Drop files here to put them in ${n.path}` : n.path}
                className={cn(
                  "flex items-center gap-2 rounded-md pr-2 text-left text-sm hover:bg-accent",
                  deep && "text-destructive",
                  dropOn === n.path && "bg-sea/15 ring-1 ring-sea/60",
                )}
              >
                <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform duration-150", isOpen && "rotate-90")} />
                <FolderIcon className="size-3.5 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                <span className={cn("min-w-0 flex-1 truncate", line.depth === 0 && side === "after" && "font-serif text-[0.95rem]")}>{n.name}</span>
                <span className="font-mono text-2xs text-muted-foreground tabular-nums">{formatCount(n.fileCount)}</span>
              </button>
            );
          }

          const { row } = line;
          const it = row.item;
          const isSel = selectedSet.has(it.id);
          const depthNow = it.rel.split("/").length - 1;
          return (
            <button
              key={`f:${it.id}`}
              type="button"
              draggable
              onDragStart={(e) => startDrag(e, it.id)}
              onClick={(e) => clickSelect(e, it.id, order)}
              style={{ ...style, paddingLeft: pad + 18 }}
              className={cn(
                "flex items-center gap-2 rounded-md pr-2 text-left text-sm hover:bg-accent",
                isSel && "bg-accent ring-1 ring-ring/30",
                row.excluded && "opacity-50",
              )}
              title={side === "before" ? `→ ${row.newRel}\n${row.reason}` : `from ${it.rel}\n${row.reason}`}
            >
              <FileGlyph item={it} />
              <span className={cn("min-w-0 flex-1 truncate", it.type === "unit" && "text-sea")}>{it.name}</span>
              {row.pinned ? <Pin className="size-3 shrink-0 text-primary" /> : null}
              {it.duplicateOf ? <Badge>copy</Badge> : null}
              {it.type === "unit" ? <Badge>{formatCount(it.fileCount ?? 0)} files</Badge> : null}
              {side === "before" && depthNow >= 8 ? (
                <Badge variant="deep">{depthNow}</Badge>
              ) : (
                <span className="font-mono text-2xs text-muted-foreground tabular-nums">{formatBytes(it.size)}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
