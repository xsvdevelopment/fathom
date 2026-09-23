const GENERIC = new Set([
  "new folder", "untitled", "untitled folder", "folder", "stuff", "misc", "miscellaneous", "other", "others",
  "old", "older", "backup", "backups", "bak", "temp", "tmp", "files", "file", "things", "junk", "random",
  "desktop", "documents", "my documents", "downloads", "pictures", "my pictures", "movies", "videos", "music",
  "users", "home", "important", "do not delete", "dont delete", "keep", "use this", "save", "saved", "sort",
  "to sort", "sort later", "later", "new", "copy", "archive", "archived", "inbox", "general", "various",
  "work in progress", "wip", "deliverables", "deliverable", "drafts", "draft", "comments", "assets", "revisions",
  "latest", "current", "done", "finished", "submitted", "review", "to review", "sent", "received", "ignore this", "delete", "delete me", "test", "export", "exports", "output",
]);

/** True when a folder name carries no meaning a person would file by. */
export function isNoiseFolder(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (n.length <= 1) return true;
  if (GENERIC.has(n)) return true;
  if (/^new folder( \(\d+\))?$/.test(n)) return true;
  if (/^untitled( folder)?( \d+)?$/.test(n)) return true;
  if (/^copy of\b/.test(n) || /\bcopy( \d+)?$/.test(n)) return true;
  if (/^(final[ _-]*)+(v?\d+)?$/.test(n)) return true;
  if (/^v\d+(\.\d+)*$/.test(n)) return true;
  if (/^q[1-4]$/.test(n)) return true;
  if (/\bbackups?\b/.test(n)) return true;
  if (/^(round|rev|draft|version)[ _-]?\d+$/.test(n)) return true;
  if (/^\d+$/.test(n)) return true;
  if (/^(.)\1+$/.test(n)) return true;
  if (/^[\W_]+$/.test(n)) return true;
  return false;
}
