import { Folder, FolderPlus } from "lucide-react";
import { useMemo, useState } from "react";
import type { Row } from "@shared/plan";
import { posixJoin, sanitizeSegment } from "@shared/paths";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatCount, plural } from "@/lib/utils";

/** Pick (or type) a destination folder for the selected items. */
export function MoveToDialog({
  open,
  onOpenChange,
  rows,
  count,
  onPick,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rows: Row[];
  count: number;
  onPick: (dir: string) => void;
}) {
  const [q, setQ] = useState("");
  const folders = useMemo(() => {
    const counts = new Map<string, number>();
    for (const r of rows) {
      let d = r.dest;
      while (d) {
        counts.set(d, (counts.get(d) ?? 0) + 1);
        d = d.includes("/") ? d.slice(0, d.lastIndexOf("/")) : "";
      }
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [rows]);
  const typed = posixJoin(...q.split(/[\\/]/).map((s) => (s.trim() ? sanitizeSegment(s) : "")));
  const matches = folders.filter(([f]) => f.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 200);
  const exact = folders.some(([f]) => f.toLowerCase() === typed.toLowerCase());

  const pick = (dir: string) => {
    onPick(dir);
    onOpenChange(false);
    setQ("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Move {plural(count, "item")} to…</DialogTitle>
          <DialogDescription>Pick a folder in the new layout, or type a path like Work/Acme/2024 to make one.</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          className="mt-4"
          placeholder="Search or type a new folder path"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && typed) pick(exact ? folders.find(([f]) => f.toLowerCase() === typed.toLowerCase())![0] : typed);
          }}
        />
        <div className="mt-3 max-h-80 overflow-y-auto rounded-lg bg-muted/40 p-1">
          {typed && !exact ? (
            <button type="button" onClick={() => pick(typed)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-accent">
              <FolderPlus className="size-4 text-sea" />
              <span>
                New folder <span className="font-mono text-xs">{typed}</span>
              </span>
            </button>
          ) : null}
          {matches.map(([f, n]) => (
            <button key={f} type="button" onClick={() => pick(f)} className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-sm hover:bg-accent">
              <Folder className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
              <span className="min-w-0 flex-1 truncate font-mono text-xs">{f}</span>
              <span className="font-mono text-2xs text-muted-foreground">{formatCount(n)}</span>
            </button>
          ))}
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
