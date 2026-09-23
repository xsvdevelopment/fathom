import { itemDate, monthOf, yearOf } from "./dates";
import { KIND_LABEL } from "./kinds";
import { basename, parentPath, sanitizeSegment } from "./paths";
import type { Item, Rule } from "./types";

const DAY = 86_400_000;

function globToRegex(glob: string): RegExp {
  const src = glob
    .split("")
    .map((c) => (c === "*" ? ".*" : c === "?" ? "." : c.replace(/[.+^${}()|[\]\\]/g, "\\$&")))
    .join("");
  return new RegExp(`^${src}$`, "i");
}

const normExt = (e: string) => e.trim().toLowerCase().replace(/^\.?/, ".");

/** True when every condition set on the rule holds. A rule with no conditions matches nothing. */
export function matchRule(item: Item, rule: Rule, now: number): boolean {
  if (item.type !== "file") return false;
  const w = rule.when;
  const checks: boolean[] = [];
  if (w.nameContains?.trim()) checks.push(item.name.toLowerCase().includes(w.nameContains.trim().toLowerCase()));
  if (w.glob?.trim()) checks.push(globToRegex(w.glob.trim()).test(item.name));
  if (w.exts?.length) checks.push(w.exts.map(normExt).includes(item.ext));
  if (w.pathContains?.trim()) checks.push(item.rel.toLowerCase().includes(w.pathContains.trim().toLowerCase()));
  if (w.kind) checks.push(item.kind === w.kind);
  if (w.minBytes != null) checks.push(item.size >= w.minBytes);
  if (w.maxBytes != null) checks.push(item.size <= w.maxBytes);
  if (w.olderThanDays != null) checks.push(now - itemDate(item) > w.olderThanDays * DAY);
  if (w.newerThanDays != null) checks.push(now - itemDate(item) <= w.newerThanDays * DAY);
  return checks.length > 0 && checks.every(Boolean);
}

/** Expands {year} {month} {kind} {ext} {parent} and makes every segment a safe folder name. */
export function expandTemplate(tpl: string, item: Item): string {
  const date = itemDate(item);
  const parent = basename(parentPath(item.rel));
  const filled = tpl
    .replaceAll("{year}", String(yearOf(date)))
    .replaceAll("{month}", monthOf(date))
    .replaceAll("{kind}", KIND_LABEL[item.kind])
    .replaceAll("{ext}", item.ext ? item.ext.slice(1) : "no extension")
    .replaceAll("{parent}", parent || "Root");
  return filled
    .split(/[/\\]/)
    .map((s) => s.trim())
    .filter((s) => s && s !== "." && s !== "..")
    .map(sanitizeSegment)
    .join("/");
}
