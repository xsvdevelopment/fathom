import { open, readFile, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import type { JournalRecord } from "@shared/types";

/** Append-only JSONL writer. `sync` forces the record to disk before returning. */
export class JournalWriter {
  private pending = 0;
  private constructor(private fh: FileHandle) {}

  static async open(path: string): Promise<JournalWriter> {
    return new JournalWriter(await open(path, "a"));
  }

  async append(rec: JournalRecord, sync = false): Promise<void> {
    await this.fh.write(`${JSON.stringify(rec)}\n`);
    this.pending += 1;
    if (sync || this.pending >= 50) await this.flush();
  }

  async flush(): Promise<void> {
    if (!this.pending) return;
    await this.fh.datasync();
    this.pending = 0;
  }

  async close(): Promise<void> {
    await this.flush();
    await this.fh.close();
  }
}

/** Reads a journal file, ignoring a torn last line from a crash. */
export async function readJournalFile(path: string): Promise<JournalRecord[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch {
    return [];
  }
  const out: JournalRecord[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as JournalRecord);
    } catch {
      // torn write at crash time
    }
  }
  return out;
}

export const readJournal = (runDir: string) => readJournalFile(join(runDir, "journal.jsonl"));
