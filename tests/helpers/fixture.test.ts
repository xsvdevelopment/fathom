import { describe, expect, it } from "vitest";
import { makeTree, readTree } from "./fixture";

describe("fixture helpers", () => {
  it("round-trips files and empty dirs", async () => {
    const spec = { "a/b/c.txt": "c", "a/d.txt": "d", "empty": null, "x/y/z": null };
    expect(await readTree(await makeTree(spec))).toEqual(spec);
  });
});
