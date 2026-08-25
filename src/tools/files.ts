import { readdir, unlink } from 'node:fs/promises';
import path from 'node:path';
import { applyPatch as applyUnifiedPatch, createTwoFilesPatch } from 'diff';
import fg from 'fast-glob';
import { atomicWrite, exists, readText, resolveInside } from '../utils/fs.js';
import type { PermissionManager } from '../permissions/manager.js';
import type { EditJournal } from './journal.js';

export interface FileToolContext {
  root: string;
  permissions: PermissionManager;
  journal: EditJournal;
}

function lineDelta(
  before: string | null,
  after: string | null,
): { added: number; removed: number } {
  const beforeLines = before?.split('\n').length ?? 0;
  const afterLines = after?.split('\n').length ?? 0;
  return {
    added: Math.max(0, afterLines - beforeLines),
    removed: Math.max(0, beforeLines - afterLines),
  };
}

async function mutate(
  ctx: FileToolContext,
  requested: string,
  after: string | null,
): Promise<object> {
  const file = await resolveInside(ctx.root, requested, true);
  const before = (await exists(file)) ? await readText(file) : null;
  await ctx.permissions.check({
    kind: after === null ? 'delete' : 'write',
    tool: after === null ? 'delete_file' : 'write_file',
    description: `${after === null ? 'delete' : 'modify'} ${path.relative(ctx.root, file)}`,
  });
  if (after === null) {
    if (before === null) throw new Error(`File does not exist: ${requested}`);
    await unlink(file);
  } else {
    await atomicWrite(file, after);
  }
  ctx.journal.record({ file, before, after });
  return { file: path.relative(ctx.root, file), ...lineDelta(before, after) };
}

export async function readFileTool(
  ctx: FileToolContext,
  input: { path: string; startLine?: number; endLine?: number },
): Promise<object> {
  const file = await resolveInside(ctx.root, input.path);
  const content = await readText(file);
  const lines = content.split(/\r?\n/);
  const start = Math.max(1, input.startLine ?? 1);
  const end = Math.min(
    lines.length,
    input.endLine ?? Math.min(lines.length, start + 1_999),
  );
  const selected = lines
    .slice(start - 1, end)
    .map((line, index) => `${String(start + index).padStart(6)} | ${line}`)
    .join('\n');
  return {
    path: path.relative(ctx.root, file),
    startLine: start,
    endLine: end,
    totalLines: lines.length,
    content: selected,
    truncated: end < lines.length,
  };
}

export async function writeFileTool(
  ctx: FileToolContext,
  input: { path: string; content: string },
): Promise<object> {
  return await mutate(ctx, input.path, input.content);
}

export async function editFileTool(
  ctx: FileToolContext,
  input: { path: string; edits: Array<{ oldText: string; newText: string }> },
): Promise<object> {
  const file = await resolveInside(ctx.root, input.path);
  const before = await readText(file);
  let after = before;
  for (const edit of input.edits) {
    const first = after.indexOf(edit.oldText);
    if (first < 0) throw new Error(`Expected text was not found in ${input.path}`);
    if (after.indexOf(edit.oldText, first + edit.oldText.length) >= 0)
      throw new Error(`Expected text is not unique in ${input.path}`);
    after = `${after.slice(0, first)}${edit.newText}${after.slice(first + edit.oldText.length)}`;
  }
  if (after === before) throw new Error('Edit produced no change.');
  return await mutate(ctx, input.path, after);
}

export async function applyPatchTool(
  ctx: FileToolContext,
  input: { path: string; patch: string },
): Promise<object> {
  const file = await resolveInside(ctx.root, input.path);
  const before = await readText(file);
  const after = applyUnifiedPatch(before, input.patch);
  if (after === false) throw new Error(`Patch did not apply cleanly to ${input.path}`);
  return await mutate(ctx, input.path, after);
}

export async function deleteFileTool(
  ctx: FileToolContext,
  input: { path: string },
): Promise<object> {
  return await mutate(ctx, input.path, null);
}

export async function listDirectoryTool(
  ctx: FileToolContext,
  input: { path?: string; depth?: number },
): Promise<object> {
  const directory = await resolveInside(ctx.root, input.path ?? '.');
  const entries = await readdir(directory, { withFileTypes: true });
  return {
    path: path.relative(ctx.root, directory) || '.',
    entries: entries.slice(0, 500).map((entry) => ({
      name: entry.name,
      type: entry.isDirectory()
        ? 'directory'
        : entry.isSymbolicLink()
          ? 'symlink'
          : 'file',
    })),
    truncated: entries.length > 500,
  };
}

const ignored = [
  '**/.git/**',
  '**/node_modules/**',
  '**/dist/**',
  '**/build/**',
  '**/target/**',
  '**/.next/**',
  '**/.venv/**',
  '**/__pycache__/**',
];

export async function globTool(
  ctx: FileToolContext,
  input: { pattern: string; limit?: number },
): Promise<object> {
  const limit = input.limit ?? 500;
  const files = await fg(input.pattern, {
    cwd: ctx.root,
    dot: true,
    onlyFiles: true,
    ignore: ignored,
    followSymbolicLinks: false,
  });
  return { files: files.slice(0, limit), truncated: files.length > limit };
}

export function sessionDiff(ctx: FileToolContext): string {
  return ctx.journal
    .changes()
    .map((entry) =>
      createTwoFilesPatch(
        path.relative(ctx.root, entry.file),
        path.relative(ctx.root, entry.file),
        entry.before ?? '',
        entry.after ?? '',
        'before',
        'after',
      ),
    )
    .join('\n');
}
