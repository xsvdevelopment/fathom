import { describe, expect, it } from "vitest";
import { coded, friendlyError } from "../../src/main/engine/errors";

describe("friendlyError", () => {
  it.each([
    ["EBUSY", /in use/i],
    ["EPERM", /didn't allow/i],
    ["EACCES", /permission/i],
    ["ENOENT", /no longer there/i],
    ["ENAMETOOLONG", /too long/i],
    ["ENOSPC", /full/i],
    ["EEXIST", /already/i],
  ])("%s reads as plain language", (code, re) => {
    const msg = friendlyError(coded(code, `${code}: raw syscall text`));
    expect(msg).toMatch(re);
    expect(msg).not.toMatch(/syscall|E[A-Z]{3,}/);
  });

  it("falls back to the message for unknown errors", () => {
    expect(friendlyError(new Error("Weird thing"))).toBe("Weird thing");
    expect(friendlyError(null)).toMatch(/.+/);
  });
});
