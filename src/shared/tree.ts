import { depthOf } from "./paths";

export type TreeEntry = { id: string; path: string; size: number };

export type TreeNode = {
  name: string;
  path: string;
  isDir: boolean;
  id?: string;
  children: TreeNode[];
  fileCount: number;
  totalBytes: number;
  /** Deepest folder depth of any file at or below this node. */
  maxDepth: number;
};

const dirNode = (name: string, path: string): TreeNode => ({
  name,
  path,
  isDir: true,
  children: [],
  fileCount: 0,
  totalBytes: 0,
  maxDepth: 0,
});

/** Builds a sorted tree (dirs first, case-insensitive) with rolled-up counts from "/"-paths. */
export function buildTree(entries: TreeEntry[]): TreeNode {
  const root = dirNode("", "");
  const dirs = new Map<string, TreeNode>([["", root]]);

  const ensureDir = (path: string): TreeNode => {
    const hit = dirs.get(path);
    if (hit) return hit;
    const i = path.lastIndexOf("/");
    const parent = ensureDir(i < 0 ? "" : path.slice(0, i));
    const node = dirNode(i < 0 ? path : path.slice(i + 1), path);
    parent.children.push(node);
    dirs.set(path, node);
    return node;
  };

  for (const e of entries) {
    const i = e.path.lastIndexOf("/");
    const parent = ensureDir(i < 0 ? "" : e.path.slice(0, i));
    parent.children.push({
      name: i < 0 ? e.path : e.path.slice(i + 1),
      path: e.path,
      isDir: false,
      id: e.id,
      children: [],
      fileCount: 1,
      totalBytes: e.size,
      maxDepth: Math.max(0, depthOf(e.path) - 1),
    });
  }

  const finish = (node: TreeNode) => {
    if (!node.isDir) return;
    node.children.sort((a, b) =>
      a.isDir !== b.isDir ? (a.isDir ? -1 : 1) : a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
    node.fileCount = 0;
    node.totalBytes = 0;
    node.maxDepth = 0;
    for (const c of node.children) {
      finish(c);
      node.fileCount += c.fileCount;
      node.totalBytes += c.totalBytes;
      node.maxDepth = Math.max(node.maxDepth, c.maxDepth);
    }
  };
  finish(root);
  return root;
}

export type DepthStats = { maxDepth: number; byDepth: number[]; deepestPath: string };

/** Counts files by how many folders deep they sit. */
export function depthStats(paths: string[]): DepthStats {
  const byDepth: number[] = [];
  let maxDepth = 0;
  let deepestPath = "";
  for (const p of paths) {
    const d = Math.max(0, depthOf(p) - 1);
    byDepth[d] = (byDepth[d] ?? 0) + 1;
    if (d > maxDepth || (d === maxDepth && p.length > deepestPath.length)) {
      maxDepth = d;
      deepestPath = p;
    }
  }
  return { maxDepth, byDepth: Array.from({ length: maxDepth + 1 }, (_, i) => byDepth[i] ?? 0), deepestPath };
}
