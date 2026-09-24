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
  "onedrive", "dropbox", "google drive", "icloud drive", "shared", "public",
]);

type AreaName = "Work" | "Studies" | "Personal" | "Code";

const AREA_WORDS: [AreaName, RegExp][] = [
  ["Work", /^(work|works|job|jobs|office|clients?|freelance|business|company|career)$/],
  ["Studies", /^(school|university|uni|college|thesis|homework|course|courses|class|classes|study|studies|lectures?|coursework)$/],
  ["Personal", /^(personal|family|home|wedding|kids|travel|medical|health|recipes|house|car|pets?|garden)$/],
  ["Code", /^(code|dev|src|repos|repositories|github|gitlab)$/],
];

/** Words in a file's own name that say which area it belongs to, used when its folders don't say. */
const NAME_AREAS: [AreaName, RegExp][] = [
  ["Personal", /\b(wedding|passport|visa|birth certificate|medical|insurance|vaccine|vaccination|lease|mortgage|recipes?|family|kids)\b/],
  ["Studies", /\b(thesis|homework|assignment|syllabus|lecture|transcript|dissertation)\b/],
];

const words = (s: string) => s.toLowerCase().replace(/[_\-.]+/g, " ").trim();

/** Ancestor folder names of an item, root first. */
function dirsOf(item: Item): string[] {
  const parent = parentPath(item.rel);
  const dirs = parent ? parent.split("/") : [];
  // A folder right under "Users" is someone's account name, not a topic.
  return dirs.filter((_, i) => i === 0 || words(dirs[i - 1]!) !== "users");
}

/** Camera-roll style folder names like "100APPLE" or "101_PANA". */
const CAMERA_DIR = /^\d{3}[_ ]?[a-z]+$/i;

function isMeaningful(name: string): boolean {
  return !isNoiseFolder(name) && !CAMERA_DIR.test(name) && !STRUCTURAL.has(words(name));
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

const at = (dest: string, reason: string): Proposal => ({
  dest: posixJoin(...dest.split("/").map(sanitizeSegment)),
  reason,
});

function areaFor(dirs: string[]): { area: AreaName; project?: string } | null {
  for (let i = 0; i < dirs.length; i += 1) {
    const w = words(dirs[i]!);
    const hit = AREA_WORDS.find(([, re]) => re.test(w));
    if (!hit) continue;
    const after = dirs.slice(i + 1).find(isMeaningful);
    if (after) return { area: hit[0], project: after };
    if (!STRUCTURAL.has(w)) return { area: hit[0], project: dirs[i] };
    return { area: hit[0] };
  }
  return null;
}

/** The built-in "smart" placement for one item. First matching rule wins. */
export function classifySmart(item: Item): Proposal {
  const dirs = dirsOf(item);
  if (item.type === "unit") {
    // Keep sibling projects together under the folder that grouped them, so "ncwd/MGNSuite" and
    // "NewWork/MGNSuite" don't collide as "Code/MGNSuite (2)".
    const group = nearestMeaningful(dirs);
    return at(group ? `Code/${group}` : "Code", `Project folder (${item.unitReason ?? "marker found"})`);
  }

  const name = words(item.name);
  const hay = `${name} ${dirs.map(words).join(" ")}`;

  if ((item.kind === "image" || item.kind === "video") && /^(screenshot|screen shot|screen recording|capture|snip)/.test(name)) {
    return at(`Media/Screenshots/${yearFor(item, [])}`, "Screenshot");
  }
  if (item.kind === "installer") {
    const setupLike =
      item.ext !== ".exe" ||
      /(setup|install|installer|update|upgrade|x64|x86|amd64|win(32|64)?|\d+\.\d+)/.test(name) ||
      /\bdownloads?\b/.test(hay) ||
      dirs.length === 0;
    return setupLike
      ? at("Inbox/Installers", "Installer — safe to review and delete later")
      : at("Inbox/Programs", "Program file on its own");
  }

  // Only things a person reads can be a tax form or a recipe; a "w2.smali" is code.
  const docLike = ["document", "spreadsheet", "presentation", "image", "archive", "design", "ebook"].includes(item.kind);
  if (docLike && /\b(tax|taxes|w ?2|1099(?: \w+)?|return \d{4})\b/.test(hay)) {
    const year = yearFor(item, dirs);
    return at(`Finance/Taxes/${year}`, `Tax document, ${year}`);
  }
  if (docLike && /\b(invoices?|receipts?|statements?|bank|payslips?|paystubs?|payroll|bills?)\b/.test(name)) {
    const project = nearestMeaningful(dirs);
    return at(`Finance/${project ?? "Records"}`, project ? `Financial record for “${project}”` : "Financial record");
  }
  if (docLike && /\b(resume|cv|curriculum vitae)\b/.test(name)) return at("Work/Resume", "Resume");
  if (item.kind === "font") return at("Design/Fonts", "Font");
  if (item.kind === "ebook") return at("Library/Books", "E-book");

  const area = areaFor(dirs);
  const stillImage = item.kind === "image" && !item.takenMs;
  if (!area && (docLike || stillImage)) {
    const hit = NAME_AREAS.find(([, re]) => re.test(name));
    if (hit) return at(hit[0], `Looks ${hit[0].toLowerCase()} (“${item.name}”)`);
  }
  if ((docLike || stillImage) && /(^|\b)(scan|scanned)/.test(name)) return at("Documents/Scans", "Scanned document");

  const cameraPhoto = Boolean(item.takenMs) || !area || area.area === "Code";
  if ((item.kind === "image" || item.kind === "video") && cameraPhoto) {
    const place = nearestMeaningful(dirs);
    const year = item.takenMs ? yearOf(item.takenMs) : (yearIn(dirs.join("/")) ?? yearOf(itemDate(item)));
    if (place) {
      const dest = yearIn(place) ? place : `${place} ${year}`;
      return at(`Media/${dest}`, `${item.kind === "video" ? "Video" : "Photo"} from “${place}”`);
    }
    const label = item.kind === "video" ? "Video" : "Photos";
    return at(`Media/${label} ${year}`, `${item.kind === "video" ? "Video" : "Photo"}, ${year}`);
  }
  if (item.kind === "audio") return at("Media/Audio", "Audio");

  if (area) {
    const trail = area.project ? `${area.area}/${area.project}` : area.area;
    return at(trail, `Found under “${area.project ?? area.area}”`);
  }

  const project = nearestMeaningful(dirs);
  switch (item.kind) {
    case "document":
    case "spreadsheet":
    case "presentation":
      return project ? at(`Documents/${project}`, `Document in “${project}”`) : at("Documents", "Loose document");
    case "archive":
      return at("Inbox/Archives", "Archive — open it or file it");
    case "design":
    case "image":
      return at(project ? `Design/${project}` : "Design", "Design file");
    case "data":
      return at("Code/Data", "Data file");
    case "code":
      return at(project ? `Code/${project}` : "Code/Loose files", "Loose code file");
    default:
      return project ? at(`Inbox/${project}`, `Unrecognized file in “${project}”`) : at("Inbox/Unsorted", "Unrecognized file type");
  }
}
