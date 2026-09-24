import { useMemo } from "react";
import { buildRows, type Row } from "@shared/plan";
import { depthStats } from "@shared/tree";
import { useApp, type Filter } from "@/store/app";

export type PlanView = {
  rows: Row[];
  byId: Map<string, Row>;
  visible: Row[];
  before: ReturnType<typeof depthStats>;
  after: ReturnType<typeof depthStats>;
  counts: Record<Filter, number>;
  bytesMoving: number;
};

const FILTERS: Record<Filter, (r: Row) => boolean> = {
  all: () => true,
  moving: (r) => r.moved,
  staying: (r) => !r.moved,
  duplicates: (r) => Boolean(r.item.duplicateOf),
  projects: (r) => r.item.type === "unit",
  pinned: (r) => r.pinned,
  excluded: (r) => r.excluded,
};

/** Every derived number the Studio shows, recomputed only when the plan changes. */
export function usePlan(): PlanView {
  const items = useApp((s) => s.items);
  const proposals = useApp((s) => s.proposals);
  const overrides = useApp((s) => s.overrides);
  const excluded = useApp((s) => s.excluded);
  const destRoot = useApp((s) => s.destRoot);
  const filter = useApp((s) => s.filter);
  const query = useApp((s) => s.query);

  const rows = useMemo(
    () => buildRows(items, proposals, overrides, excluded, destRoot || (items[0]?.root ?? "")),
    [items, proposals, overrides, excluded, destRoot],
  );
  const byId = useMemo(() => new Map(rows.map((r) => [r.item.id, r])), [rows]);
  const before = useMemo(() => depthStats(items.map((i) => i.rel)), [items]);
  const after = useMemo(() => depthStats(rows.map((r) => r.newRel)), [rows]);
  const counts = useMemo(() => {
    const c = {} as Record<Filter, number>;
    for (const f of Object.keys(FILTERS) as Filter[]) c[f] = rows.filter(FILTERS[f]).length;
    return c;
  }, [rows]);
  const bytesMoving = useMemo(() => rows.reduce((s, r) => s + (r.moved ? r.item.size : 0), 0), [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const f = FILTERS[filter];
    return rows.filter((r) => f(r) && (!q || `${r.item.rel} ${r.newRel} ${r.reason}`.toLowerCase().includes(q)));
  }, [rows, filter, query]);

  return { rows, byId, visible, before, after, counts, bytesMoving };
}
