import { describe, expect, it } from "vitest";
import { classifySmart, itemDate } from "@shared/classify";
import { mk } from "./factory";

const dest = (p: Parameters<typeof mk>[0]) => classifySmart(mk(p)).dest;

describe("classifySmart", () => {
  it.each([
    ["Desktop/Screenshot 2023-04-01 at 10.00.png", "Media/Screenshots/2023"],
    ["Downloads/ChromeSetup.exe", "Inbox/Installers"],
    ["Documents/stuff/tax-return-2019.pdf", "Finance/Taxes/2019"],
    ["Documents/New folder/W2_2021.pdf", "Finance/Taxes/2021"],
    ["Documents/Taxes/2018/1099-misc.pdf", "Finance/Taxes/2018"],
    ["Work/Clients/Acme/final/invoice-001.pdf", "Finance/Acme"],
    ["Downloads/bank-statement-jan.pdf", "Finance/Records"],
    ["Desktop/old/Resume_2024.docx", "Work/Resume"],
    ["Pictures/Italy 2019/IMG_1.jpg", "Media/Italy 2019"],
    ["Pictures/2019/lisbon/IMG_1.jpg", "Media/lisbon 2019"],
    ["Work/Clients/Acme/brand/notes.docx", "Work/Acme"],
    ["School/Thesis/drafts/ch1.docx", "Studies/Thesis"],
    ["stuff/misc/random.txt", "Documents"],
    ["a/b/c/d/e/f/g/h/Recipes/pie.pdf", "Personal/Recipes"],
    ["Documents/Personal/travel/italy-2022/tickets.pdf", "Personal/travel"],
    ["fonts/Inter.ttf", "Design/Fonts"],
    ["x/y.zzz", "Inbox/Unsorted"],
    ["Downloads/podcast-episode.mp3", "Media/Audio"],
    ["Downloads/driver-pack.zip", "Inbox/Archives"],
    ["Books/dune.epub", "Library/Books"],
    ["Desktop/New folder/the/rabbit/wedding-guest-list.xlsx", "Personal"],
    ["Desktop/stuff/scan-passport.jpg", "Personal"],
    ["Desktop/scan_2020_03.jpg", "Documents/Scans"],
    ["Downloads/Medical-insurance-card.pdf", "Personal"],
    ["Documents/Work/Clients/Acme/2023/Q1/deliverables/recording-call.mp4", "Work/Acme"],
    ["Documents/Work/Clients/Acme/2022/Q2/deliverables/invoice-001.pdf", "Finance/Acme"],
    ["old macbook backup/Users/alex/Desktop/notes.txt", "Documents"],
    ["Pictures/iPhone Backup/DCIM/100APPLE/IMG_3001.HEIC", "Media/Photos 2022"],
  ])("%s → %s", (rel, want) => expect(dest({ rel })).toBe(want));

  it("uses the EXIF date for phone photos in noise folders", () => {
    expect(dest({ rel: "DCIM/100APPLE/IMG_2.HEIC", takenMs: Date.UTC(2021, 5, 1) })).toBe("Media/Photos 2021");
  });

  it("sends protected units to Code", () => {
    expect(dest({ rel: "Desktop/old/my-app", type: "unit" })).toBe("Code");
  });

  it("gives every proposal a human reason", () => {
    expect(classifySmart(mk({ rel: "Downloads/ChromeSetup.exe" })).reason).toMatch(/installer/i);
  });
});

describe("itemDate", () => {
  it("prefers EXIF, then the earlier of created/modified", () => {
    expect(itemDate(mk({ rel: "a.jpg", takenMs: 5, mtimeMs: 10, birthtimeMs: 20 }))).toBe(5);
    expect(itemDate(mk({ rel: "a.txt", mtimeMs: 10, birthtimeMs: 20 }))).toBe(10);
    expect(itemDate(mk({ rel: "a.txt", mtimeMs: 30, birthtimeMs: 0 }))).toBe(30);
  });
});
