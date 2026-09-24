import { CircleAlert, ShieldCheck, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { Row } from "@shared/plan";
import { toPlanItems } from "@shared/plan";
import type { PlanItem, PreflightIssue, PreflightResult } from "@shared/types";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn, formatBytes, middleTruncate, plural } from "@/lib/utils";
import { useApp } from "@/store/app";

const GROUP_TITLE: Record<PreflightIssue["code"], string> = {
  collision: "Will get a new name to avoid overwriting",
  stale: "Changed since the scan — skipped",
  missing: "No longer there — skipped",
  "no-write": "Can't write to the destination",
  space: "Not enough space",
  "path-too-long": "Path too long — skipped",
  "into-itself": "Can't move inside itself — skipped",
};

/** Checks the plan against the disk and asks for a clear yes before anything moves. */
export function ReviewDialog({ open, onOpenChange, rows }: { open: boolean; onOpenChange: (o: boolean) => void; rows: Row[] }) {
  const destRoot = useApp((s) => s.destRoot);
  const roots = useApp((s) => s.roots);
  const sample = useApp((s) => s.sample);
  const startJob = useApp((s) => s.startJob);
  const [result, setResult] = useState<PreflightResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [ack, setAck] = useState(false);

  const planned: PlanItem[] = useMemo(() => (destRoot ? toPlanItems(rows, destRoot) : []), [rows, destRoot]);

  useEffect(() => {
    if (!open) return;
    setResult(null);
    setAck(false);
    if (sample || !destRoot) return;
    setChecking(true);
    window.fathom
      .preflight(planned, destRoot)
      .then(setResult)
      .catch((err) => toast.error(err instanceof Error ? err.message : "Couldn't check the plan."))
      .finally(() => setChecking(false));
  }, [open, planned, destRoot, sample]);

  const groups = useMemo(() => {
    const m = new Map<PreflightIssue["code"], PreflightIssue[]>();
    for (const i of result?.issues ?? []) m.set(i.code, [...(m.get(i.code) ?? []), i]);
    return [...m.entries()];
  }, [result]);
  const blocking = result?.issues.some((i) => i.level === "error" && !i.id) ?? false;
  const warnings = result?.issues.filter((i) => i.level === "warn" || i.id).length ?? 0;
  const bytes = result?.items.reduce((s, i) => s + i.size, 0) ?? 0;
  const canApply = !sample && result && result.items.length > 0 && !blocking && (warnings === 0 || ack);

  const apply = async () => {
    if (!result) return;
    try {
      const { jobId, runId } = await window.fathom.apply(result.items, destRoot, roots);
      onOpenChange(false);
      startJob({ jobId, runId, kind: "apply", done: 0, total: result.items.length, current: "", destRoot });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't start moving files.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Review before moving</DialogTitle>
          <DialogDescription>
            Fathom just re-checked every file against the disk. Nothing has moved yet.
          </DialogDescription>
        </DialogHeader>

        {sample ? (
          <p className="mt-4 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            This is the sample desk, so there are no real files to move. Choose one of your own folders from the start screen to
            try it for real.
          </p>
        ) : !destRoot ? (
          <p className="mt-4 rounded-lg bg-muted p-4 text-sm text-muted-foreground">Choose where the tidy folders should go first.</p>
        ) : checking || !result ? (
          <div className="mt-6 h-1 overflow-hidden rounded-full bg-muted">
            <div className="indeterminate h-full w-1/3 rounded-full bg-sea/80" />
          </div>
        ) : (
          <>
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="rounded-lg bg-muted p-3">
                <p className="text-2xs tracking-[0.12em] text-muted-foreground uppercase">Moving</p>
                <p className="font-serif text-3xl tabular-nums">{result.items.length.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-2xs tracking-[0.12em] text-muted-foreground uppercase">Already in place</p>
                <p className="font-serif text-3xl tabular-nums">{result.unchanged.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-muted p-3">
                <p className="text-2xs tracking-[0.12em] text-muted-foreground uppercase">Size</p>
                <p className="font-serif text-3xl tabular-nums">{formatBytes(bytes)}</p>
              </div>
            </div>

            {groups.length ? (
              <div className="mt-4 max-h-64 overflow-y-auto rounded-lg bg-muted/50 p-3">
                {groups.map(([code, list]) => {
                  const err = list.some((i) => i.level === "error");
                  return (
                    <details key={code} className="py-1" open={err}>
                      <summary className={cn("flex cursor-pointer items-center gap-2 text-sm", err ? "text-destructive" : "text-warn")}>
                        {err ? <CircleAlert className="size-4" /> : <TriangleAlert className="size-4" />}
                        {GROUP_TITLE[code]} ({list.length})
                      </summary>
                      <ul className="mt-1 flex flex-col gap-1 pl-6">
                        {list.slice(0, 100).map((i, n) => (
                          <li key={`${i.id ?? ""}${n}`} className="text-xs text-muted-foreground">
                            {i.message}
                          </li>
                        ))}
                        {list.length > 100 ? <li className="text-xs text-muted-foreground">…and {list.length - 100} more</li> : null}
                      </ul>
                    </details>
                  );
                })}
              </div>
            ) : null}

            <p className="mt-4 flex items-start gap-2 text-sm">
              <ShieldCheck className="mt-0.5 size-4 shrink-0 text-ok" />
              <span>
                {plural(result.items.length, "item")} will move into <span className="font-mono text-xs">{middleTruncate(destRoot, 60)}</span>.
                Nothing will be deleted — exact copies go to <span className="font-mono text-xs">_Fathom Review</span>. You can undo the
                whole run from History.
              </span>
            </p>
            {warnings > 0 && !blocking ? (
              <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
                I've read the notes above
              </label>
            ) : null}
          </>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Keep editing
          </Button>
          <Button onClick={() => void apply()} disabled={!canApply} data-testid="confirm-apply">
            {result ? `Move ${plural(result.items.length, "item")}` : "Move files"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
