import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmdirSync, rmSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const ORIGINAL: Record<string, string> = {
  "New folder/New folder (2)/old/final/tax-return-2021.pdf": "t".repeat(4000),
  "Downloads/ChromeSetup.exe": "e".repeat(4000),
  "Downloads/Screenshot 2024-05-01 at 10.00.png": "s".repeat(4000),
  "Downloads/invoice-7781.pdf": "i".repeat(4000),
  "Downloads/copy/invoice-7781.pdf": "i".repeat(4000),
  "Work/Clients/Acme/Q2/deliverables/brand-notes.docx": "b".repeat(4000),
  "old laptop/my-app/.git/HEAD": "ref: refs/heads/main",
  "old laptop/my-app/src/index.js": "console.log(1)",
};

function readTree(root: string): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (abs: string, rel: string) => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(join(abs, e.name), r);
      else out[r] = readFileSync(join(abs, e.name), "utf8");
    }
  };
  walk(root, "");
  return out;
}

test("scan, move, and undo a real folder", async () => {
  // Outside AppData and outside this repo on purpose: Fathom refuses app-settings folders and folders inside projects.
  const root = join(homedir(), ".fathom-e2e", `mess-${Date.now()}`);
  rmSync(root, { recursive: true, force: true });
  for (const [rel, content] of Object.entries(ORIGINAL)) {
    const p = join(root, ...rel.split("/"));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, content);
  }
  const data = mkdtempSync(join(tmpdir(), "fathom-e2e-"));
  const exe = process.env.FATHOM_EXE;
  const env = { ...process.env, FATHOM_DATA_DIR: data, FATHOM_TEST_PICK: root };
  const app = await electron.launch(exe ? { executablePath: exe, args: [], env } : { args: ["."], env });
  const win = await app.firstWindow();
  const errors: string[] = [];
  win.on("pageerror", (e) => errors.push(String(e)));

  await win.getByTestId("choose-folders").click();
  await win.getByTestId("review-apply").click({ timeout: 30_000 });
  await expect(win.getByTestId("confirm-apply")).toBeEnabled({ timeout: 30_000 });
  await win.getByTestId("confirm-apply").click();
  await expect(win.getByText(/items? moved/)).toBeVisible({ timeout: 30_000 });

  const after = readTree(root);
  expect(after["Finance/Taxes/2021/tax-return-2021.pdf"]).toBe(ORIGINAL["New folder/New folder (2)/old/final/tax-return-2021.pdf"]);
  expect(after["Code/old laptop/my-app/.git/HEAD"]).toBe("ref: refs/heads/main");
  expect(after["Inbox/Installers/ChromeSetup.exe"]).toBeDefined();
  expect(Object.keys(after).some((k) => k.startsWith("_Fathom Review/Duplicates/"))).toBe(true);
  expect(Object.keys(after).some((k) => k.startsWith("New folder/"))).toBe(false);

  await win.getByRole("button", { name: "Undo this run" }).click();
  await expect(win.getByText("back where they were")).toBeVisible({ timeout: 30_000 });
  expect(readTree(root)).toEqual(ORIGINAL);

  await win.getByRole("button", { name: "Back to start" }).click();
  await win.getByRole("button", { name: "History" }).first().click();
  await expect(win.getByText("Undone", { exact: true })).toBeVisible();

  expect(errors).toEqual([]);
  await app.close();
  rmSync(root, { recursive: true, force: true });
  try {
    rmdirSync(dirname(root));
  } catch {
    // another run still using it
  }
});
