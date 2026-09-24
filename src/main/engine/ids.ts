import { createHash } from "node:crypto";

export function itemId(root: string, rel: string): string {
  return createHash("sha1").update(`${root}\0${rel}`).digest("hex").slice(0, 16);
}
