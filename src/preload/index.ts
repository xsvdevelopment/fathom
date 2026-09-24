import { contextBridge, ipcRenderer, webUtils } from "electron";
import pkg from "../../package.json";
import type { FathomApi, JobEvent } from "../shared/api";

const invoke = <T>(channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args) as Promise<T>;

const api: FathomApi = {
  pickFolders: () => invoke("pickFolders"),
  pickFolder: () => invoke("pickFolder"),
  pathForFile: (file) => webUtils.getPathForFile(file),
  checkRoots: (roots) => invoke("checkRoots", roots),
  checkDest: (dest) => invoke("checkDest", dest),
  scan: (roots) => invoke("scan", roots),
  findDuplicates: () => invoke("findDuplicates"),
  cancel: (jobId) => invoke("cancel", jobId),
  preflight: (items, destRoot) => invoke("preflight", items, destRoot),
  apply: (items, destRoot, roots) => invoke("apply", items, destRoot, roots),
  listRuns: () => invoke("listRuns"),
  undo: (runId) => invoke("undo", runId),
  finish: (runId) => invoke("finish", runId),
  loadSettings: () => invoke("loadSettings"),
  saveSettings: (s) => invoke("saveSettings", s),
  reveal: (p) => invoke("reveal", p),
  openPath: (p) => invoke("openPath", p),
  runFolder: (runId) => invoke("runFolder", runId),
  exportCsv: (csv, name) => invoke("exportCsv", csv, name),
  onJob: (cb) => {
    const listener = (_: unknown, e: JobEvent) => cb(e);
    ipcRenderer.on("fathom:job", listener);
    return () => ipcRenderer.removeListener("fathom:job", listener);
  },
  version: pkg.version,
};

contextBridge.exposeInMainWorld("fathom", api);
