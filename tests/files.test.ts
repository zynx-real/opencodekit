import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { PermissionManager } from '../src/permissions/manager.js';
import { EditJournal } from '../src/tools/journal.js';
import {
  applyPatchTool,
  editFileTool,
  readFileTool,
  writeFileTool,
} from '../src/tools/files.js';

describe('file tools', () => {
  let root: string;
  let journal: EditJournal;
  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'opencodekit-files-'));
    journal = new EditJournal();
  });
  const context = () => ({
    root,
    journal,
    permissions: new PermissionManager('auto-edit'),
  });

  it('reads numbered line ranges', async () => {
    await writeFile(path.join(root, 'a.txt'), 'one\ntwo\nthree');
    const result = await readFileTool(context(), {
      path: 'a.txt',
      startLine: 2,
      endLine: 3,
    });
    expect(result).toMatchObject({ startLine: 2, endLine: 3, totalLines: 3 });
    expect((result as { content: string }).content).toContain('2 | two');
  });

  it('writes, exact-edits, patches, and undoes safely', async () => {
    await writeFileTool(context(), { path: 'a.txt', content: 'hello\nworld\n' });
    await editFileTool(context(), {
      path: 'a.txt',
      edits: [{ oldText: 'world', newText: 'agent' }],
    });
    await applyPatchTool(context(), {
      path: 'a.txt',
      patch: '@@ -1,2 +1,2 @@\n hello\n-agent\n+kit\n',
    });
    expect(await readFile(path.join(root, 'a.txt'), 'utf8')).toBe('hello\nkit\n');
    await journal.undo();
    expect(await readFile(path.join(root, 'a.txt'), 'utf8')).toBe('hello\nagent\n');
  });

  it('rejects failed patches, traversal, and binary files', async () => {
    await writeFile(path.join(root, 'a.txt'), 'hello\n');
    await expect(
      applyPatchTool(context(), { path: 'a.txt', patch: '@@ -1 +1 @@\n-nope\n+yes\n' }),
    ).rejects.toThrow('did not apply');
    await expect(readFileTool(context(), { path: '../outside' })).rejects.toThrow(
      'escapes repository',
    );
    await writeFile(path.join(root, 'binary'), Buffer.from([1, 0, 2]));
    await expect(readFileTool(context(), { path: 'binary' })).rejects.toThrow(
      'Binary file',
    );
  });

  it('does not undo over external user changes', async () => {
    await writeFileTool(context(), { path: 'a.txt', content: 'agent' });
    await writeFile(path.join(root, 'a.txt'), 'user');
    await expect(journal.undo()).rejects.toThrow('changed after');
  });
});
