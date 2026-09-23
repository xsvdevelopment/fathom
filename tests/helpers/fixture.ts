import { mkdir, mkdtemp, readdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

/** Creates a temp dir. Keys are "/"-separated rel paths; string = file content, null = empty dir. */
export async function makeTree(spec: Record<string, string | null>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "fathom-test-"));
  for (const [rel, content] of Object.entries(spec)) {
    const abs = join(root, ...rel.split("/"));
    if (content === null) {
      await mkdir(abs, { recursive: true });
    } else {
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, content);
    }
  }
  return root;
}

/** Inverse of makeTree: files → content, empty dirs → null, keys sorted. */
export async function readTree(root: string): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {};
  const walk = async (abs: string, rel: string) => {
    const entries = await readdir(abs, { withFileTypes: true });
    if (entries.length === 0 && rel) out[rel] = null;
    for (const e of entries) {
      const childRel = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) await walk(join(abs, e.name), childRel);
      else out[childRel] = await readFile(join(abs, e.name), "utf8");
    }
  };
  await walk(root, "");
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
