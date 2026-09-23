import { kindOf } from "./kinds";
import { basename, extOf } from "./paths";
import type { Item } from "./types";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEEP_CHAIN = [
  "Desktop",
  "New folder",
  "New folder (2)",
  "Copy of New folder",
  "important",
  "do not delete",
  "stuff",
  "misc",
  "old",
  "backup",
  "final",
  "final FINAL",
  "use this",
  "v2",
  "v3",
  "temp",
  "untitled folder",
  "Work in progress",
  "really",
  "please",
  "read",
  "me",
  "later",
  "actually",
  "wait",
  "one more",
  "folder",
  "inside",
  "another",
  "nested-project",
  "why",
  "are",
  "these",
  "still",
  "going",
  "down",
  "the",
  "rabbit",
  "hole",
  "keep-going",
] as const;

function day(year: number, month: number, date: number, jitter = 0) {
  return Date.UTC(year, month - 1, date, 10, jitter % 60, 0);
}

export const DEMO_ROOT = "C:/Users/you/Sample desk";

/** A deterministic, 40-folders-deep sample desk. Plan-only: none of these files exist. */
export function buildDemoItems(): Item[] {
  const rand = mulberry32(20260923);
  const items: Item[] = [];
  let n = 0;

  const add = (rel: string, size: number, mtimeMs: number, _flags: string[] = []) => {
    n += 1;
    const name = basename(rel);
    items.push({
      id: `demo-${n}`,
      type: "file",
      root: DEMO_ROOT,
      rel,
      name,
      ext: extOf(name),
      size,
      mtimeMs,
      birthtimeMs: mtimeMs,
      kind: kindOf(name),
    });
  };
  const unit = (rel: string, fileCount: number, size: number, reason: string) => {
    n += 1;
    const name = basename(rel);
    items.push({
      id: `demo-${n}`,
      type: "unit",
      root: DEMO_ROOT,
      rel,
      name,
      ext: "",
      size,
      mtimeMs: day(2023, 4, 8),
      birthtimeMs: day(2023, 4, 8),
      kind: "other",
      fileCount,
      unitReason: reason,
    });
  };
  const empty = (_rel: string) => {};

  const size = (min: number, max: number) => Math.floor(min + rand() * (max - min));

  if (DEEP_CHAIN.length !== 40) {
    throw new Error(`Deep chain must be 40 folders, got ${DEEP_CHAIN.length}`);
  }

  const deepRoot = DEEP_CHAIN.join("/");
  add(`${deepRoot}/tax-return-2019.pdf`, size(220_000, 800_000), day(2019, 4, 12), ["buried"]);
  add(`${deepRoot}/wedding-guest-list.xlsx`, size(40_000, 90_000), day(2018, 6, 2), ["buried"]);
  add(`${deepRoot}/scan-passport.jpg`, size(1_800_000, 3_200_000), day(2017, 11, 9), ["buried"]);
  add(
    `${DEEP_CHAIN.slice(0, 12).join("/")}/notes-DONT-LOSE.txt`,
    size(800, 4000),
    day(2021, 1, 18),
    ["buried"],
  );
  add(
    `${DEEP_CHAIN.slice(0, 22).join("/")}/password-hints.docx`,
    size(18_000, 40_000),
    day(2020, 8, 4),
    ["buried"],
  );

  empty("Desktop/New folder/New folder (3)");
  empty("Desktop/aaaaaaa");
  empty("Desktop/Old stuff/really old/older than that");

  const desktopFiles = [
    "Screenshot 2024-03-12 at 9.41.22 AM.png",
    "Screenshot 2024-03-12 at 9.41.48 AM.png",
    "Screenshot 2025-11-02 at 11.02.01 PM.png",
    "Screenshot 2026-01-18 at 7.13.44 AM.png",
    "Untitled document.docx",
    "Untitled document (2).docx",
    "Untitled spreadsheet.xlsx",
    "Resume_FINAL.pdf",
    "Resume_FINAL_v7.pdf",
    "Resume_FINAL_v8_USE_THIS.pdf",
    "Resume_FINAL_v8_USE_THIS (1).pdf",
    "to-print.pdf",
    "invoice-june.pdf",
    "IMG_2841.HEIC",
    "IMG_2842.HEIC",
    "movie-night.mp4",
    "track-ideas.mp3",
    "install-photoshop.dmg",
    "archive-old-desktop.zip",
    "TODO.txt",
    "passwords-backup.txt",
    "lease-signed.pdf",
    "Copy of lease-signed.pdf",
    "meeting-notes-FINAL.docx",
    "meeting-notes-FINAL-FINAL.docx",
  ];
  desktopFiles.forEach((name, i) => {
    add(`Desktop/${name}`, size(12_000, 4_500_000), day(2023 + (i % 4), (i % 12) + 1, (i % 27) + 1));
  });

  for (let i = 1; i <= 18; i += 1) {
    add(
      `Desktop/Screenshots/Screenshot 2024-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}.png`,
      size(180_000, 2_200_000),
      day(2024, (i % 12) + 1, (i % 28) + 1),
    );
  }

  const clients = [
    { name: "Acme", years: [2022, 2023, 2024] },
    { name: "Northwind", years: [2021, 2022] },
    { name: "Harbor Studio", years: [2023, 2024, 2025] },
  ];
  const workDocs = [
    "proposal.pdf",
    "proposal-v2.pdf",
    "proposal-FINAL.pdf",
    "contract-signed.pdf",
    "invoice-001.pdf",
    "invoice-002.pdf",
    "brand-notes.docx",
    "timeline.xlsx",
    "moodboard.png",
    "logo-export.svg",
    "recording-call.mp4",
  ];
  for (const client of clients) {
    for (const year of client.years) {
      for (const q of ["Q1", "Q2", "Q3", "Q4"]) {
        if (rand() < 0.35) continue;
        const base = `Documents/Work/Clients/${client.name}/${year}/${q}/deliverables`;
        for (const doc of workDocs) {
          if (rand() < 0.45) continue;
          const nested = rand() > 0.7 ? `${base}/final/use this` : base;
          add(`${nested}/${doc}`, size(20_000, 8_000_000), day(year, 3, 4, Math.floor(rand() * 40)));
        }
        if (rand() > 0.6) empty(`${base}/old drafts`);
      }
    }
  }

  for (let year = 2016; year <= 2025; year += 1) {
    add(`Documents/Taxes/${year}/return-${year}.pdf`, size(200_000, 900_000), day(year, 4, 10));
    add(`Documents/Taxes/${year}/w2.pdf`, size(80_000, 200_000), day(year, 1, 31));
    if (year % 2 === 0) add(`Documents/Taxes/${year}/1099-misc.pdf`, size(40_000, 120_000), day(year, 2, 12));
    if (year < 2019) empty(`Documents/Taxes/${year}/receipts/unsorted`);
  }

  add("Documents/Personal/lease-signed.pdf", 244_000, day(2022, 8, 1));
  add("Documents/Personal/family/recipes.docx", 18_000, day(2020, 12, 20));
  add("Documents/Personal/family/kids-school-forms.pdf", 90_000, day(2023, 9, 6));
  add("Documents/Personal/travel/italy-2022/itinerary.pdf", 120_000, day(2022, 5, 3));
  add("Documents/Personal/travel/italy-2022/tickets.pdf", 80_000, day(2022, 5, 3));
  add("Documents/Personal/wedding/guest-list.xlsx", 52_000, day(2018, 6, 2));
  add("Documents/Personal/wedding/vows.docx", 12_000, day(2018, 6, 10));
  add("Documents/Personal/medical/vaccine-card.jpg", 1_100_000, day(2021, 4, 2));

  const downloads = [
    "ChromeSetup.exe",
    "Node-v20.dmg",
    "invoice_stripe_20481.pdf",
    "bank-statement-jan.pdf",
    "bank-statement-feb.pdf",
    "photo-export.zip",
    "funny-cat.mp4",
    "presentation-template.pptx",
    "random-notes.txt",
    "IMG_4412.JPG",
    "IMG_4413.JPG",
    "resume-from-email.pdf",
    "Offer_Letter.pdf",
    "manual-scanner.pdf",
    "driver-pack.zip",
    "podcast-episode.mp3",
    "budget-2024.xlsx",
    "Copy of budget-2024.xlsx",
    "figma-export.png",
    "whitepaper.pdf",
  ];
  downloads.forEach((name, i) => {
    add(`Downloads/${name}`, size(8_000, 90_000_000), day(2024, (i % 12) + 1, (i % 26) + 1));
  });
  for (let i = 0; i < 16; i += 1) {
    add(
      `Downloads/Screenshot ${2025}-${String((i % 12) + 1).padStart(2, "0")}-${String((i % 27) + 1).padStart(2, "0")}.png`,
      size(200_000, 1_800_000),
      day(2025, (i % 12) + 1, (i % 27) + 1),
    );
  }

  const cities = ["lisbon", "osaka", "mexico-city", "reykjavik"];
  cities.forEach((city, ci) => {
    for (let i = 1; i <= 8; i += 1) {
      add(
        `Pictures/${2019 + ci}/${city}/IMG_${1200 + ci * 40 + i}.jpg`,
        size(2_400_000, 6_000_000),
        day(2019 + ci, (i % 12) + 1, i + 2),
      );
    }
  });
  for (let i = 1; i <= 12; i += 1) {
    add(
      `Pictures/iPhone Backup/DCIM/100APPLE/IMG_${3000 + i}.HEIC`,
      size(1_500_000, 4_000_000),
      day(2024, 6, i),
    );
  }

  unit("Projects/harbor-site", 7, 180_000, "package.json");
  unit("Projects/invoice-tool", 7, 210_000, "package.json");
  unit("Projects/old-portfolio", 9, 260_000, ".git");
  unit("Desktop/old/unity-game-jam", 412, 380_000_000, "Unity project");

  const thesisDirs = [
    "School/Thesis/drafts",
    "School/Thesis/drafts/comments/from-advisor/round-4",
    "School/Thesis/drafts/comments/from-advisor/round-4/please-read/v9",
    "School/Thesis/final",
    "School/Thesis/final/FINAL",
    "School/Thesis/research/pdfs",
  ];
  thesisDirs.forEach((dir, i) => {
    add(`${dir}/chapter-1.docx`, size(80_000, 400_000), day(2017, 3, i + 1), i > 1 ? ["buried"] : []);
    add(`${dir}/chapter-2.docx`, size(80_000, 400_000), day(2017, 4, i + 1));
  });
  add("School/Thesis/thesis-FINAL-SUBMIT.pdf", 4_800_000, day(2017, 5, 12));
  add("School/Homework/calc-201/assignment-3.pdf", 220_000, day(2015, 10, 3));
  add("School/Homework/calc-201/assignment-3-solutions.pdf", 180_000, day(2015, 10, 8));

  const backupRoot = "old macbook backup/Users/alex/Desktop";
  [
    "Resume_FINAL.pdf",
    "Screenshot 2018-02-11.png",
    "to-print.pdf",
    "notes.txt",
    "tax-return-2019.pdf",
  ].forEach((name, i) => {
    add(`${backupRoot}/${name}`, size(20_000, 900_000), day(2018, 2, i + 4), ["backup"]);
  });
  add(`${backupRoot}/New folder/Copy of Copy of thesis FINAL FINAL.pdf`, 3_200_000, day(2017, 5, 1), [
    "backup",
    "buried",
  ]);

  add("Desktop/Copy of Desktop/Resume_FINAL.pdf", 188_000, day(2022, 1, 3));
  add("Desktop/Copy of Desktop/TODO.txt", 400, day(2022, 1, 3));
  add("Desktop/Copy of Desktop/lease-signed.pdf", 244_000, day(2022, 1, 3));

  empty("Downloads/New folder");
  empty("Pictures/Untitled folder");
  empty("Documents/Work/Clients/OldClient/2014");
  empty("Desktop/ignore this");

  for (let i = 0; i < 14; i += 1) {
    add(
      `Documents/Scans/scan${2019 + (i % 6)}-${String(i + 1).padStart(2, "0")}.pdf`,
      size(400_000, 3_000_000),
      day(2019 + (i % 6), (i % 12) + 1, 14),
    );
  }

  // Exact duplicates: same name and size stands in for a content hash in the sample.
  const keeper = new Map<string, Item>();
  const sorted = [...items].sort((a, b) => a.rel.split("/").length - b.rel.split("/").length);
  for (const it of sorted) {
    if (it.type !== "file") continue;
    const key = `${it.name.toLowerCase()}|${it.size}`;
    const k = keeper.get(key);
    if (k) it.duplicateOf = k.id;
    else keeper.set(key, it);
  }
  return items;
}

