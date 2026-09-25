const GENERIC = new Set([
  "new folder", "untitled", "untitled folder", "folder", "stuff", "misc", "miscellaneous", "other", "others",
  "old", "older", "backup", "backups", "bak", "temp", "tmp", "files", "file", "things", "junk", "random",
  "desktop", "documents", "my documents", "downloads", "pictures", "my pictures", "movies", "videos", "music",
  "users", "home", "important", "do not delete", "dont delete", "keep", "use this", "save", "saved", "sort",
  "to sort", "sort later", "later", "new", "copy", "archive", "archived", "inbox", "general", "various",
  "work in progress", "wip", "deliverables", "deliverable", "drafts", "draft", "comments", "assets", "revisions",
  "latest", "current", "done", "finished", "submitted", "review", "to review", "sent", "received", "ignore this", "delete", "delete me", "test", "export", "exports", "output",
]);

/** Filler words people use when nesting folders in frustration ("why/are/these/still/going"). */
const STOPWORDS = new Set([
  "the", "a", "an", "me", "my", "i", "you", "we", "it", "why", "what", "who", "are", "is", "was", "these", "those",
  "this", "that", "still", "going", "down", "up", "inside", "another", "wait", "actually", "please", "read",
  "really", "more", "one more", "here", "there", "and", "or", "of", "to", "in", "on", "so", "ok", "okay", "hmm",
]);

/** A whole old machine or drive copied over ("old laptop", "Dad's PC backup"): a pile to sort, not a topic. */
const DEVICE_DUMP =
  /^([a-z]+'?s )?(old |older |previous |former )?(laptop|pc|computer|macbook|imac|mac|phone|iphone|tablet|ipad|hard ?drive|hdd|ssd|usb( stick)?|flash ?drive|external( drive)?|sd card)( (backup|dump|export|files|stuff|copy|transfer))?$/;

/**
 * True when a folder name says nothing at all ("New folder", "untitled 3", "qq", "why"): a wrapper that can
 * disappear without losing anything. "old", "v2" and "2019" are noise too, but not blank: beside their
 * siblings they still tell things apart.
 */
export function isBlankFolder(name: string): boolean {
  const n = name.trim().toLowerCase();
  // A single character or digit is not blank: apps shard caches into "0"…"f" folders that must stay apart.
  if (n.length > 1 && STOPWORDS.has(n)) return true;
  if (n === "folder" || n === "new" || n === "untitled" || n === "untitled folder") return true;
  if (/^new folder( \(\d+\))?$/.test(n)) return true;
  if (/^untitled( folder)?( \d+)?$/.test(n)) return true;
  if (/^([a-z])\1{2,}$/.test(n)) return true;
  return n.length > 1 && /^[\W_]+$/.test(n);
}

/** True when a folder name carries no meaning a person would file by. */
export function isNoiseFolder(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (n.length <= 1 || isBlankFolder(n) || /^(.)\1+$/.test(n) || /^[\W_]+$/.test(n)) return true;
  if (GENERIC.has(n) || DEVICE_DUMP.test(n)) return true;
  // "Downloads-2026-09-24", "Desktop (2)": a catch-all with a date or a copy number stuck on.
  const core = n
    .replace(/[ _.-]*\(?\d{4}[-_.]?\d{2}([-_.]?\d{2})?\)?/g, "")
    .replace(/[ _-]*\(\d+\)$/, "")
    .trim();
  if (core !== n && GENERIC.has(core)) return true;
  if (/^copy of\b/.test(n) || /\bcopy( \d+)?$/.test(n)) return true;
  if (/^(final[ _-]*)+(v?\d+)?$/.test(n)) return true;
  if (/^v\d+(\.\d+)*$/.test(n)) return true;
  if (/^q[1-4]$/.test(n)) return true;
  if (/\bbackups?\b/.test(n)) return true;
  if (/^(round|rev|draft|version)[ _-]?\d+$/.test(n)) return true;
  return /^\d+$/.test(n);
}
