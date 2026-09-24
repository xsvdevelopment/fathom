import { extOf } from "./paths";
import type { Kind } from "./types";

const EXTS: Record<Kind, string[]> = {
  document: ["pdf", "doc", "docx", "txt", "rtf", "md", "pages", "odt", "tex", "wpd", "log"],
  spreadsheet: ["xls", "xlsx", "xlsm", "csv", "tsv", "numbers", "ods"],
  presentation: ["ppt", "pptx", "key", "odp"],
  image: ["png", "jpg", "jpeg", "gif", "webp", "heic", "heif", "svg", "raw", "dng", "cr2", "cr3", "nef", "arw", "bmp", "tif", "tiff", "ico", "avif"],
  video: ["mp4", "mov", "mkv", "avi", "webm", "m4v", "wmv", "flv", "mts", "3gp"],
  audio: ["mp3", "wav", "aac", "flac", "m4a", "aiff", "ogg", "opus", "wma", "mid", "midi"],
  code: ["js", "jsx", "ts", "tsx", "mjs", "cjs", "py", "go", "rs", "java", "c", "cpp", "cc", "h", "hpp", "cs", "html", "css", "scss", "yml", "yaml", "toml", "sh", "ps1", "bat", "cmd", "rb", "php", "swift", "kt", "lua", "ipynb",
    "smali", "dex", "so", "jar", "class", "gradle", "kts", "properties", "mk", "cmake", "o", "asm", "s"],
  archive: ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz", "iso"],
  installer: ["exe", "msi", "dmg", "pkg", "appx", "msix", "apk", "apkm", "xapk", "apks", "deb", "rpm"],
  data: ["json", "xml", "sql", "db", "sqlite", "sqlite3", "parquet", "bak"],
  design: ["psd", "ai", "fig", "sketch", "blend", "indd", "xd", "afdesign", "afphoto", "eps", "fbx", "obj", "stl"],
  font: ["ttf", "otf", "woff", "woff2", "fon"],
  ebook: ["epub", "mobi", "azw", "azw3", "djvu", "cbz", "cbr"],
  other: [],
};

const BY_EXT = new Map<string, Kind>();
for (const [kind, exts] of Object.entries(EXTS) as [Kind, string[]][]) {
  for (const e of exts) BY_EXT.set(`.${e}`, kind);
}

export function kindOf(name: string): Kind {
  return BY_EXT.get(extOf(name)) ?? "other";
}

export const KIND_LABEL: Record<Kind, string> = {
  document: "Documents",
  spreadsheet: "Spreadsheets",
  presentation: "Presentations",
  image: "Images",
  video: "Video",
  audio: "Audio",
  code: "Code",
  archive: "Archives",
  installer: "Installers",
  data: "Data",
  design: "Design",
  font: "Fonts",
  ebook: "Books",
  other: "Other",
};
