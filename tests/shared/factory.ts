import { kindOf } from "@shared/kinds";
import { basename, extOf } from "@shared/paths";
import type { Item } from "@shared/types";

let n = 0;
export function mk(p: Partial<Item> & { rel: string }): Item {
  n += 1;
  const name = basename(p.rel);
  const t = Date.UTC(2022, 0, 2);
  return {
    id: `i${n}`,
    type: "file",
    root: "C:/root",
    name,
    ext: extOf(name),
    size: 1000,
    mtimeMs: t,
    birthtimeMs: t,
    kind: kindOf(name),
    ...p,
  };
}
