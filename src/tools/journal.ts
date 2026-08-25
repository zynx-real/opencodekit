import { unlink } from 'node:fs/promises';
import { atomicWrite, exists, readText } from '../utils/fs.js';

export interface EditRecord {
  file: string;
  before: string | null;
  after: string | null;
  timestamp: string;
}

export class EditJournal {
  private entries: EditRecord[] = [];
  private cursor = 0;

  record(entry: Omit<EditRecord, 'timestamp'>): void {
    this.entries = this.entries.slice(0, this.cursor);
    this.entries.push({ ...entry, timestamp: new Date().toISOString() });
    this.cursor = this.entries.length;
  }

  changes(): readonly EditRecord[] {
    return this.entries.slice(0, this.cursor);
  }

  async undo(): Promise<EditRecord> {
    if (this.cursor === 0) throw new Error('Nothing to undo.');
    const entry = this.entries[this.cursor - 1];
    if (!entry) throw new Error('Edit journal is inconsistent.');
    const current = (await exists(entry.file)) ? await readText(entry.file) : null;
    if (current !== entry.after)
      throw new Error(`Cannot undo ${entry.file}: it changed after the agent edit.`);
    if (entry.before === null) await unlink(entry.file);
    else await atomicWrite(entry.file, entry.before);
    this.cursor -= 1;
    return entry;
  }

  async redo(): Promise<EditRecord> {
    if (this.cursor >= this.entries.length) throw new Error('Nothing to redo.');
    const entry = this.entries[this.cursor];
    if (!entry) throw new Error('Edit journal is inconsistent.');
    const current = (await exists(entry.file)) ? await readText(entry.file) : null;
    if (current !== entry.before)
      throw new Error(`Cannot redo ${entry.file}: it changed after undo.`);
    if (entry.after === null) await unlink(entry.file);
    else await atomicWrite(entry.file, entry.after);
    this.cursor += 1;
    return entry;
  }
}
