/**
 * Replays a past run's file list through the current unit markers and Smart layout, without touching disk.
 * Shows what a fresh scan of the same tree would propose now. Only files and units recorded in the plan are
 * known, so empty folders and skipped names (dot files) are missing from the rebuilt tree.
 *
 *   npx esbuild scripts/replay-plan.ts --bundle --platform=node --outfile=out/replay.cjs
 *   node --max-old-space-size=8000 out/replay.cjs <run folder>
 */
import { readFileSync } from "node:fs";
import { collapseCodeTrees } from "../src/main/engine/codetrees";
import { SOURCE_PART, unitReason } from "../src/main/engine/markers";
import { kindOf } from "../src/shared/kinds";
import { proposeAll } from "../src/shared/layouts";
import { extOf } from "../src/shared/paths";
import type { Item, PlanItem } from "../src/shared/types";

type Plan = { destRoot: string; items: PlanItem[] };
const plan = JSON.parse(readFileSync(`${process.argv[2]}/plan.json`, "utf8")) as Plan;
const root = plan.destRoot;
const rels = plan.items.map((i) => ({ rel: i.from.slice(root.length + 1).split("\\").join("/"), p: i }));

// Rebuild folder → child names.
const kids = new Map<string, Set<string>>();
for (const { rel } of rels) {
  const parts = rel.split("/");
  for (let d = 0; d < parts.length; d += 1) {
    const dir = parts.slice(0, d).join("/");
    let s = kids.get(dir);
    if (!s) kids.set(dir, (s = new Set()));
    s.add(parts[d]!);
  }
}
const isDir = (rel: string) => kids.has(rel);
const planUnits = new Set(rels.filter((r) => r.p.type === "unit").map((r) => r.rel));
const peek = process.argv.slice(3);
for (const d of peek) console.log(`== ${d}
  ${[...(kids.get(d) ?? [])].slice(0, 60).join("  ")}`);

// Walk top-down like scan(): a folder that is a unit stops the descent.
const HANDS_OFF = /\b(do ?not|don'?t)[ _-]+(modify|touch|move|change|edit|delete|sort)\b/i;
const below = (rel: string) => {
  for (const c of kids.get(rel) ?? []) {
    if (!SOURCE_PART.test(c) || !isDir(`${rel}/${c}`)) continue;
    const why = unitReason(c, [...kids.get(`${rel}/${c}`)!]);
    if (why && why !== "Program folder") return why;
    if (/^(jni|src|cpp)$/.test(c) && [...kids.get(`${rel}/${c}`)!].filter((n) => kindOf(n) === "code").length >= 2) return "Source tree";
  }
  return null;
};
const walked: Item[] = [];
const stack = [""];
while (stack.length) {
  const dir = stack.pop()!;
  for (const name of kids.get(dir) ?? []) {
    const rel = dir ? `${dir}/${name}` : name;
    if (HANDS_OFF.test(name)) continue;
    const base = { id: rel, root, rel, name, mtimeMs: 1.77e12, birthtimeMs: 1.77e12 };
    if (planUnits.has(rel)) {
      walked.push({ ...base, type: "unit", ext: "", size: 0, kind: "other", unitReason: "already a unit" });
    } else if (isDir(rel)) {
      const why = unitReason(name, [...kids.get(rel)!]) ?? below(rel);
      if (why) {
        walked.push({ ...base, type: "unit", ext: "", size: 0, kind: "other", unitReason: why });
      } else stack.push(rel);
    } else {
      walked.push({ ...base, type: "file", ext: extOf(name), size: 1, kind: kindOf(name) });
    }
  }
}

const items = collapseCodeTrees(walked);
const files = items.filter((i) => i.type === "file");
const units = items.filter((i) => i.type === "unit");
console.log(`before: ${plan.items.length} moves`);
console.log(`now: ${items.length} items (${units.length} units, ${files.length} loose files)`);

const props = proposeAll(items, "smart", [], Date.now());
const by = new Map<string, number>();
for (const i of items) {
  const d = props.get(i.id)?.dest ?? "?";
  const k = d.split("/").slice(0, 2).join("/");
  by.set(k, (by.get(k) ?? 0) + 1);
}
console.log("--- destinations (top 2 levels)");
console.log([...by].sort((a, b) => b[1] - a[1]).slice(0, 40).map(([k, n]) => `${n}\t${k}`).join("\n"));
const reasons = new Map<string, number>();
for (const u of units) reasons.set(u.unitReason!, (reasons.get(u.unitReason!) ?? 0) + 1);
console.log("--- unit reasons", Object.fromEntries(reasons));
// Folders that still spill the most loose files: the next thing to look at.
const spill = new Map<string, number>();
for (const f of files) {
  const top = f.rel.split("/").slice(0, 3).join("/");
  spill.set(top, (spill.get(top) ?? 0) + 1);
}
console.log("--- biggest loose-file folders (3 levels)");
console.log([...spill].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, n]) => `${n}\t${k}`).join("\n"));
