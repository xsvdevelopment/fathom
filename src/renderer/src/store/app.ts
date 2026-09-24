import { toast } from "sonner";
import { create } from "zustand";
import { errText } from "@/lib/utils";
import type { DupesDone, JobEvent, ScanDone } from "@shared/api";
import { buildDemoItems, DEMO_ROOT } from "@shared/demo";
import { proposeAll } from "@shared/layouts";
import type { Item, Layout, Proposal, RunSummary, Settings, UndoSummary } from "@shared/types";

export type Screen = "home" | "scanning" | "studio" | "apply" | "history" | "rules";
export type Filter = "all" | "moving" | "staying" | "duplicates" | "projects" | "pinned" | "excluded";

export type ScanState = {
  jobId?: string;
  phase: "walk" | "dupes" | "done";
  files: number;
  dirs: number;
  bytes: number;
  current: string;
  done: number;
  total: number;
  errors: { path: string; message: string }[];
};

export type JobState = {
  jobId?: string;
  kind: "apply" | "undo" | "finish";
  runId?: string;
  done: number;
  total: number;
  current: string;
  result?: RunSummary | UndoSummary;
  error?: string;
  destRoot?: string;
};

type Snapshot = { layout: Layout; overrides: Record<string, string>; excluded: Record<string, true> };

type State = {
  screen: Screen;
  settings: Settings | null;
  roots: string[];
  items: Item[];
  sample: boolean;
  scan: ScanState;
  layout: Layout;
  proposals: Map<string, Proposal>;
  overrides: Record<string, string>;
  excluded: Record<string, true>;
  history: Snapshot[];
  destRoot: string;
  query: string;
  filter: Filter;
  selected: string[];
  anchor: string | null;
  job: JobState | null;

  init: () => Promise<void>;
  goto: (s: Screen) => void;
  startScan: (roots: string[]) => Promise<void>;
  cancelScan: () => void;
  skipDupes: () => void;
  loadSample: () => void;
  setLayout: (l: Layout) => void;
  recompute: () => void;
  moveTo: (ids: string[], dir: string) => void;
  togglePin: (ids: string[]) => void;
  setExcluded: (ids: string[], excluded: boolean) => void;
  undoEdit: () => void;
  resetEdits: () => void;
  setDestRoot: (p: string) => void;
  setQuery: (q: string) => void;
  setFilter: (f: Filter) => void;
  setSelected: (ids: string[], anchor?: string | null) => void;
  startJob: (job: JobState) => void;
  cancelJob: () => void;
  clearJob: () => void;
  saveSettings: (patch: Partial<Settings>) => Promise<void>;
};

const emptyScan = (): ScanState => ({ phase: "walk", files: 0, dirs: 0, bytes: 0, current: "", done: 0, total: 0, errors: [] });

let subscribed = false;

export const useApp = create<State>((set, get) => {
  const snapshot = (): Snapshot => ({ layout: get().layout, overrides: get().overrides, excluded: get().excluded });
  const pushHistory = () => set({ history: [...get().history, snapshot()].slice(-50) });

  const finishScan = () => {
    const { roots } = get();
    set({ scan: { ...get().scan, phase: "done" } });
    get().recompute();
    set({ screen: "studio", destRoot: roots.length === 1 ? roots[0]! : "" });
  };

  const onJob = (e: JobEvent) => {
    const s = get();
    if (e.kind === "scan" && e.jobId === s.scan.jobId) {
      if (e.type === "progress") set({ scan: { ...s.scan, files: e.files ?? 0, dirs: e.dirs ?? 0, bytes: e.bytes ?? 0, current: e.current ?? "" } });
      else if (e.type === "chunk") set({ items: s.items.concat(e.items) });
      else if (e.type === "done") {
        const r = e.result as ScanDone;
        set({ scan: { ...get().scan, errors: r.errors, files: r.count } });
        const files = get().items.filter((i) => i.type === "file").length;
        if (s.settings?.findDuplicates && files > 1) {
          void window.fathom.findDuplicates().then(({ jobId }) => set({ scan: { ...get().scan, jobId, phase: "dupes", done: 0, total: 0 } }));
        } else finishScan();
      } else if (e.type === "error") {
        set({ screen: "home", scan: emptyScan(), items: [] });
        if (!e.cancelled) toast.error(e.message);
      }
    } else if (e.kind === "dupes" && e.jobId === s.scan.jobId) {
      if (e.type === "progress") set({ scan: { ...s.scan, done: e.done ?? 0, total: e.total ?? 0 } });
      else if (e.type === "done") {
        const byId = new Map((e.result as DupesDone).updates.map((u) => [u.id, u]));
        set({ items: s.items.map((i) => (byId.has(i.id) ? { ...i, ...byId.get(i.id) } : i)) });
        finishScan();
      } else if (e.type === "error") finishScan();
    } else if (s.job && e.jobId === s.job.jobId) {
      if (e.type === "progress") set({ job: { ...s.job, done: e.done ?? 0, total: e.total ?? 0, current: e.current ?? "" } });
      else if (e.type === "done") set({ job: { ...s.job, result: e.result as RunSummary | UndoSummary } });
      else if (e.type === "error") set({ job: { ...s.job, error: e.message } });
    }
  };

  return {
    screen: "home",
    settings: null,
    roots: [],
    items: [],
    sample: false,
    scan: emptyScan(),
    layout: "smart",
    proposals: new Map(),
    overrides: {},
    excluded: {},
    history: [],
    destRoot: "",
    query: "",
    filter: "all",
    selected: [],
    anchor: null,
    job: null,

    init: async () => {
      if (!subscribed) {
        subscribed = true;
        window.fathom.onJob(onJob);
      }
      const settings = await window.fathom.loadSettings();
      set({ settings, layout: settings.layout });
    },

    goto: (screen) => set({ screen }),

    startScan: async (roots) => {
      set({
        screen: "scanning",
        roots,
        items: [],
        sample: false,
        scan: emptyScan(),
        overrides: {},
        excluded: {},
        history: [],
        selected: [],
        query: "",
        filter: "all",
      });
      try {
        const { jobId } = await window.fathom.scan(roots);
        set({ scan: { ...get().scan, jobId } });
      } catch (err) {
        set({ screen: "home" });
        toast.error(errText(err, "Couldn't start the scan."));
      }
    },

    cancelScan: () => {
      const id = get().scan.jobId;
      if (id) void window.fathom.cancel(id);
      set({ screen: "home", items: [], scan: emptyScan() });
    },

    skipDupes: () => {
      const id = get().scan.jobId;
      if (id) void window.fathom.cancel(id);
    },

    loadSample: () => {
      set({
        roots: [DEMO_ROOT],
        items: buildDemoItems(),
        sample: true,
        scan: { ...emptyScan(), phase: "done" },
        overrides: {},
        excluded: {},
        history: [],
        selected: [],
        query: "",
        filter: "all",
        destRoot: DEMO_ROOT,
      });
      get().recompute();
      set({ screen: "studio" });
    },

    setLayout: (layout) => {
      if (layout === get().layout) return;
      pushHistory();
      set({ layout });
      get().recompute();
      void get().saveSettings({ layout });
    },

    recompute: () => {
      const { items, layout, settings } = get();
      set({ proposals: proposeAll(items, layout, settings?.rules ?? [], Date.now()) });
    },

    moveTo: (ids, dir) => {
      if (!ids.length) return;
      pushHistory();
      const overrides = { ...get().overrides };
      const excluded = { ...get().excluded };
      for (const id of ids) {
        overrides[id] = dir;
        delete excluded[id];
      }
      set({ overrides, excluded });
    },

    togglePin: (ids) => {
      if (!ids.length) return;
      pushHistory();
      const { overrides, proposals, items } = get();
      const next = { ...overrides };
      const allPinned = ids.every((id) => id in next);
      const byId = new Map(items.map((i) => [i.id, i]));
      for (const id of ids) {
        if (allPinned) delete next[id];
        else if (!(id in next)) {
          const it = byId.get(id);
          next[id] = proposals.get(id)?.dest ?? (it?.rel.includes("/") ? it.rel.slice(0, it.rel.lastIndexOf("/")) : "");
        }
      }
      set({ overrides: next });
    },

    setExcluded: (ids, value) => {
      if (!ids.length) return;
      pushHistory();
      const excluded = { ...get().excluded };
      for (const id of ids) {
        if (value) excluded[id] = true;
        else delete excluded[id];
      }
      set({ excluded });
    },

    undoEdit: () => {
      const h = get().history;
      const last = h[h.length - 1];
      if (!last) return;
      const layoutChanged = last.layout !== get().layout;
      set({ ...last, history: h.slice(0, -1) });
      if (layoutChanged) get().recompute();
    },

    resetEdits: () => {
      pushHistory();
      set({ overrides: {}, excluded: {} });
    },

    setDestRoot: (destRoot) => set({ destRoot }),
    setQuery: (query) => set({ query }),
    setFilter: (filter) => set({ filter }),
    setSelected: (selected, anchor) => set({ selected, anchor: anchor === undefined ? get().anchor : anchor }),

    startJob: (job) => set({ job, screen: "apply" }),
    cancelJob: () => {
      const id = get().job?.jobId;
      if (id) void window.fathom.cancel(id);
    },
    clearJob: () => set({ job: null }),

    saveSettings: async (patch) => {
      const cur = get().settings;
      if (!cur) return;
      const settings = { ...cur, ...patch };
      set({ settings });
      await window.fathom.saveSettings(settings);
      if (patch.rules) get().recompute();
    },
  };
});
