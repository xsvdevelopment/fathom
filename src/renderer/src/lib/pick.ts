import { toast } from "sonner";
import type { RootCheck } from "@shared/types";

/**
 * Checks folders before scanning. Blocked folders are explained and dropped; warned folders need a yes.
 * Returns the folders that may be scanned.
 */
export async function vetRoots(roots: string[], confirm: (checks: RootCheck[]) => Promise<boolean>): Promise<string[]> {
  if (!roots.length) return [];
  const checks = await window.fathom.checkRoots(roots);
  for (const c of checks.filter((c) => c.level === "block")) toast.error(c.message ?? "Fathom can't reorganize that folder.", { description: c.root });
  const warns = checks.filter((c) => c.level === "warn");
  if (warns.length && !(await confirm(warns))) return [];
  return checks.filter((c) => c.level !== "block").map((c) => c.root);
}
