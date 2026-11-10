import { itemDate, yearIn, yearOf } from "./dates";
import { isNoiseFolder } from "./noise";
import { parentPath, posixJoin, sanitizeSegment } from "./paths";
import type { Item, Proposal } from "./types";

export { itemDate } from "./dates";

/** Folders that describe a category, not a project; skipped when picking a project name. */
export const STRUCTURAL = new Set([
  "work", "clients", "client", "projects", "project", "school", "personal", "documents", "docs", "finance",
  "finances", "pictures", "photos", "photo", "images", "image", "dcim", "camera", "camera roll", "media",
  "home", "users", "invoices", "receipts", "statements", "scans", "videos", "video", "screenshots",
  "onedrive", "dropbox", "google drive", "icloud drive", "shared", "public", "design", "library",
]);

export type AreaName = "Work" | "Studies" | "Personal" | "Code";

export const AREA_WORDS: [AreaName, RegExp][] = [
  ["Work", /^(work|works|job|jobs|office|clients?|freelance|business|company|career)$/],
  ["Studies", /^(school|university|uni|college|thesis|homework|course|courses|class|classes|study|studies|lectures?|coursework)$/],
  ["Personal", /^(personal|family|home|wedding|kids|travel|medical|health|recipes|house|car|pets?|garden)$/],
  ["Code", /^(code|dev|src|repos|repositories|github|gitlab)$/],
];

/** Words in a file's own name that say which area it belongs to, used when its folders don't say. */
const NAME_AREAS: [AreaName, RegExp][] = [
  ["Personal", /\b(wedding|passport|visa|birth certificate|medical|insurance|vaccine|vaccination|prescription|lease|mortgage|recipes?|family|kids|itinerary|boarding pass|drivers? licen[cs]e)\b/],
  ["Studies", /\b(thesis|homework|assignment|syllabus|lecture|transcript|dissertation|essay|coursework|study guide|lab report|statement of purpose|personal statement)\b/],
  ["Work", /\b(offer letter|contract|nda|proposal|meeting notes|minutes|agenda|timesheet|statement of work|sow|job description|onboarding|performance review|reference letter)\b/],
];

/** Money words in a file's name, and the Finance folder each one files under. */
const FINANCE_NAMES: [string, RegExp][] = [
  ["Invoices", /\binvoices?\b/],
  ["Receipts", /\breceipts?\b/],
  ["Payslips", /\b(payslips?|paystubs?|payroll)\b/],
  ["Statements", /\b(statements?|bank)\b/],
  ["Bills", /\bbills?\b/],
  ["Budgets", /\b(budgets?|expenses)\b/],
  ["Records", /\b(ledgers?|payouts?|transactions)\b/],
];

/** Phrases that use a money word for something else ("statement of purpose", "bill of materials"). */
const NOT_FINANCE =
  /\b(statement of (purpose|work|intent)|(personal|mission|artist|vision) statement|bill of (materials|lading|rights|sale)|(food|blood|river|power|data|question|piggy) bank|bank holiday)\b/;

/** File names a camera or phone gives a picture ("IMG_2841", "DSC00012", "PXL_20240101_…"). */
const CAMERA_NAME = /^(img|dsc[nf]?|pxl|mvimg|gopr|dji|pano|vid|mov|wp|photo|whatsapp image) ?\d|^\d{8} \d{6}/;
const CAMERA_EXT = new Set([".jpg", ".jpeg", ".heic", ".heif", ".raw", ".dng", ".cr2", ".cr3", ".nef", ".arw"]);

export const words = (s: string) => s.toLowerCase().replace(/[_\-.]+/g, " ").trim();

/** Ancestor folder names of an item, root first. */
function dirsOf(item: Item): string[] {
  const parent = parentPath(item.rel);
  const dirs = parent ? parent.split("/") : [];
  // A folder right under "Users" is someone's account name, not a topic.
  return dirs.filter((_, i) => i === 0 || words(dirs[i - 1]!) !== "users");
}

/** Camera-roll style folder names like "100APPLE" or "101_PANA". */
export const CAMERA_DIR = /^\d{3}[_ ]?[a-z]+$/i;

/**
 * Folders Fathom fills with loose files ("Photos 2024", "Invoices", "Unsorted"). They name a kind of file, not
 * a topic, so a file is never filed by one, and on a re-assess their contents get a second look.
 */
export const BUCKET =
  /^((photos|videos?|images|screenshots|audio|taxes|invoices|receipts|statements|payslips|bills|budgets|records|notes|manuals|scans|archives|installers|programs|unsorted|loose files|web pages|data|fonts|books|resume)( (19|20)\d{2})?|(19|20)\d{2})$/;

export function isMeaningful(name: string): boolean {
  const w = words(name);
  return !isNoiseFolder(name) && !CAMERA_DIR.test(name) && !STRUCTURAL.has(w) && !BUCKET.test(w);
}

function nearestMeaningful(dirs: string[]): string | undefined {
  for (let i = dirs.length - 1; i >= 0; i -= 1) {
    if (isMeaningful(dirs[i]!)) return dirs[i];
  }
  return undefined;
}

function yearFor(item: Item, dirs: string[]): number {
  return yearIn(item.name) ?? yearIn(dirs.join("/")) ?? yearOf(itemDate(item));
}

/** A loose bucket is split by year once it holds this many files: a year folder for two photos is clutter. */
export const SPLIT_FEW = 12;
/** Catch-all buckets ("Documents", "Inbox/Archives") only split by year when they would be unmanageable flat. */
export const SPLIT_MANY = 40;

/**
 * Where one loose item wants to go, before the rest of the plan is known. `year` is added to `base` only when
 * the bucket ends up with at least `splitAt` files. `weak` marks a guess from the file type alone, which a
 * folder the person already has can override.
 */
export type Loose = { base: string; reason: string; year?: number; sep?: " " | "/"; splitAt?: number; weak?: boolean };

const at = (dest: string, reason: string, more: Omit<Loose, "base" | "reason"> = {}): Loose => ({
  base: posixJoin(...dest.split("/").map(sanitizeSegment)),
  reason,
  ...more,
});

/** Settles a loose placement once it's known how many files share its bucket. */
export function resolveLoose(l: Loose, bucketSize: number): Proposal {
  if (l.year === undefined || bucketSize < (l.splitAt ?? 0)) return { dest: l.base, reason: l.reason };
  return { dest: `${l.base}${l.sep ?? "/"}${l.year}`, reason: `${l.reason}, ${l.year}` };
}

function areaFor(dirs: string[]): { area: AreaName; project?: string } | null {
  for (let i = 0; i < dirs.length; i += 1) {
    const w = words(dirs[i]!);
    const hit = AREA_WORDS.find(([, re]) => re.test(w));
    if (!hit) continue;
    const after = dirs.slice(i + 1).find(isMeaningful);
    if (after) return { area: hit[0], project: after };
    if (!STRUCTURAL.has(w) && w !== hit[0].toLowerCase()) return { area: hit[0], project: dirs[i] };
    return { area: hit[0] };
  }
  return null;
}

/** The built-in "smart" placement for one item, judged on its own. First matching rule wins. */
export function classifyLoose(item: Item): Loose {
  const dirs = dirsOf(item);
  if (item.type === "unit") {
    // Keep sibling projects together under the folder that grouped them, so "Clients/Website" and
    // "Old laptop/Website" don't collide as "Code/Website (2)".
    const group = nearestMeaningful(dirs);
    return at(group ? `Code/${group}` : "Code", `Project folder (${item.unitReason ?? "marker found"})`);
  }

  const name = words(item.name);
  const hay = `${name} ${dirs.map(words).join(" ")}`;
  const visual = item.kind === "image" || item.kind === "video";

  if (visual && /^(screenshot|screen shot|screen recording|screencast|capture|snip)/.test(name)) {
    return at("Media/Screenshots", "Screenshot", { year: yearFor(item, []), splitAt: SPLIT_FEW });
  }
  if (item.kind === "installer") {
    const setupLike =
      item.ext !== ".exe" ||
      /(setup|install|installer|update|upgrade|x64|x86|amd64|win(32|64)?|\d+\.\d+)/.test(name) ||
      /\bdownloads?\b/.test(hay) ||
      dirs.length === 0;
    return setupLike
      ? at("Inbox/Installers", "Installer, safe to review and delete later")
      : at("Inbox/Programs", "Program file on its own");
  }

  // Only things a person reads can be a tax form or a recipe; a "w2.smali" is code.
  const docLike = ["document", "spreadsheet", "presentation", "image", "archive", "design", "ebook"].includes(item.kind);
  if (docLike && /\b(tax|taxes|w ?2|1099(?: \w+)?|return \d{4})\b/.test(hay)) {
    return at("Finance/Taxes", "Tax document", { year: yearFor(item, dirs) });
  }
  const money = docLike && !NOT_FINANCE.test(name) ? FINANCE_NAMES.find(([, re]) => re.test(name)) : undefined;
  if (money) {
    const project = nearestMeaningful(dirs);
    return project
      ? at(`Finance/${project}`, `Financial record for “${project}”`)
      : at(`Finance/${money[0]}`, `Financial record (${money[0].toLowerCase()})`);
  }
  if (docLike && /\b(resume|cv|curriculum vitae|cover letter)\b/.test(name)) return at("Work/Resume", "Resume");
  if (item.kind === "font") return at("Design/Fonts", "Font");
  if (item.kind === "ebook") return at("Library/Books", "E-book");

  const area = areaFor(dirs);
  const stillImage = item.kind === "image" && !item.takenMs;
  if (!area && (docLike || stillImage)) {
    const hit = NAME_AREAS.find(([, re]) => re.test(name));
    if (hit) return at(hit[0], `Looks ${hit[0].toLowerCase()} (“${item.name}”)`, { weak: true });
  }
  // "scan-0042" and "Scanned letter" are scans; "scanner manual" and "Scandinavia" are not.
  if (!area && (docLike || stillImage) && /\bscan(ned|s)?(?![a-z])/.test(name)) return at("Documents/Scans", "Scanned document");

  const cameraPhoto = Boolean(item.takenMs) || !area || area.area === "Code";
  if (visual && cameraPhoto) {
    const video = item.kind === "video";
    const place = nearestMeaningful(dirs);
    const year = item.takenMs ? yearOf(item.takenMs) : (yearIn(dirs.join("/")) ?? yearOf(itemDate(item)));
    if (place) {
      const dest = yearIn(place) ? place : `${place} ${year}`;
      return at(`Media/${dest}`, `${video ? "Video" : "Photo"} from “${place}”`);
    }
    if (video) return at("Media/Videos", "Video", { year, sep: " ", splitAt: SPLIT_FEW, weak: true });
    // A PNG nobody photographed is a graphic: an export, a meme, a diagram. It doesn't belong in the camera roll.
    const fromCamera = Boolean(item.takenMs) || CAMERA_EXT.has(item.ext) || CAMERA_NAME.test(name);
    if (!fromCamera) {
      return item.ext === ".svg" || item.ext === ".ico"
        ? at("Design", "Design file", { year, splitAt: SPLIT_MANY, weak: true })
        : at("Media/Images", "Image", { year, splitAt: SPLIT_MANY, weak: true });
    }
    return at("Media/Photos", "Photo", { year, sep: " ", splitAt: SPLIT_FEW, weak: !CAMERA_NAME.test(name) });
  }
  const generic = { year: yearOf(itemDate(item)), splitAt: SPLIT_MANY, weak: true };
  if (item.kind === "audio") return at("Media/Audio", "Audio", generic);

  if (area) {
    const trail = area.project ? `${area.area}/${area.project}` : area.area;
    // Lying on the area's own shelf with no project is the weakest kind of filed: a named folder can claim it.
    return at(trail, `Found under “${area.project ?? area.area}”`, { weak: !area.project });
  }

  const project = nearestMeaningful(dirs);
  switch (item.kind) {
    case "document":
    case "spreadsheet":
    case "presentation":
      if (project) return at(`Documents/${project}`, `Document in “${project}”`);
      if (/\b(manual|user guide|quick ?start|instructions|handbook|warranty)\b/.test(name)) {
        return at("Documents/Manuals", "Manual or guide", { weak: true });
      }
      if ((item.ext === ".txt" || item.ext === ".md") && /\b(notes?|todo|to do|ideas|readme)\b/.test(name)) {
        return at("Documents/Notes", "Note", { weak: true });
      }
      return at("Documents", "Loose document", generic);
    case "archive":
      return at("Inbox/Archives", "Archive to open or file", generic);
    case "design":
    case "image":
      return project ? at(`Design/${project}`, "Design file") : at("Design", "Design file", generic);
    case "data":
      return at("Code/Data", "Data file");
    case "code":
      // An HTML file with no project around it is a page someone saved to read, not source.
      if (!project && /^\.html?$/.test(item.ext)) return at("Documents/Web pages", "Saved web page", { weak: true });
      return at(project ? `Code/${project}` : "Code/Loose files", "Loose code file");
    default:
      return project
        ? at(`Inbox/${project}`, `Unrecognized file in “${project}”`)
        : at("Inbox/Unsorted", "Unrecognized file type", generic);
  }
}

/** `classifyLoose` for one item with nothing to weigh it against: year folders as for a typical bucket. */
export function classifySmart(item: Item): Proposal {
  return resolveLoose(classifyLoose(item), SPLIT_FEW);
}
