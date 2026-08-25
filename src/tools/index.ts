import { access } from 'node:fs/promises';
import path from 'node:path';
import { tool, type ToolSet } from 'ai';
import { z } from 'zod';
import type { PermissionManager } from '../permissions/manager.js';
import { runProcess } from '../utils/process.js';
import {
  applyPatchTool,
  deleteFileTool,
  editFileTool,
  globTool,
  listDirectoryTool,
  readFileTool,
  sessionDiff,
  writeFileTool,
  type FileToolContext,
} from './files.js';
import { EditJournal } from './journal.js';
import { searchRepository } from './search.js';

export interface ToolEvent {
  phase: 'start' | 'end';
  tool: string;
  input?: unknown;
  output?: unknown;
  elapsedMs?: number;
}

export interface ToolSystem {
  tools: ToolSet;
  journal: EditJournal;
  sessionDiff(): string;
}

export function createToolSystem(options: {
  root: string;
  permissions: PermissionManager;
  signal?: AbortSignal | (() => AbortSignal | undefined);
}): ToolSystem {
  const journal = new EditJournal();
  const ctx: FileToolContext = {
    root: options.root,
    permissions: options.permissions,
    journal,
  };
  const failures = new Map<string, number>();
  const signal = () =>
    typeof options.signal === 'function' ? options.signal() : options.signal;
  const git = async (args: string[]) => {
    const result = await runProcess('git', args, {
      cwd: options.root,
      timeoutMs: 20_000,
      signal: signal(),
    });
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
      truncated: result.truncated,
    };
  };

  const tools = {
    read_file: tool({
      description:
        'Read a UTF-8 text file with line numbers. Prefer focused line ranges for large files.',
      inputSchema: z.object({
        path: z.string(),
        startLine: z.number().int().positive().optional(),
        endLine: z.number().int().positive().optional(),
      }),
      execute: async (input) => await readFileTool(ctx, input),
    }),
    write_file: tool({
      description: 'Create or replace a UTF-8 file. Prefer edit_file for small changes.',
      inputSchema: z.object({ path: z.string(), content: z.string() }),
      execute: async (input) => await writeFileTool(ctx, input),
    }),
    edit_file: tool({
      description:
        'Atomically apply one or more unique exact text replacements to a file.',
      inputSchema: z.object({
        path: z.string(),
        edits: z
          .array(z.object({ oldText: z.string().min(1), newText: z.string() }))
          .min(1),
      }),
      execute: async (input) => await editFileTool(ctx, input),
    }),
    apply_patch: tool({
      description: 'Apply a validated unified diff to one existing file.',
      inputSchema: z.object({ path: z.string(), patch: z.string().min(1) }),
      execute: async (input) => await applyPatchTool(ctx, input),
    }),
    delete_file: tool({
      description: 'Delete one file inside the repository after permission approval.',
      inputSchema: z.object({ path: z.string() }),
      execute: async (input) => await deleteFileTool(ctx, input),
    }),
    list_directory: tool({
      description: 'List the immediate children of a repository directory.',
      inputSchema: z.object({
        path: z.string().optional(),
        depth: z.number().int().min(1).max(5).optional(),
      }),
      execute: async (input) => await listDirectoryTool(ctx, input),
    }),
    glob: tool({
      description:
        'Find repository files using a glob pattern while respecting standard exclusions.',
      inputSchema: z.object({
        pattern: z.string(),
        limit: z.number().int().min(1).max(2_000).optional(),
      }),
      execute: async (input) => await globTool(ctx, input),
    }),
    grep: tool({
      description:
        'Search text in the repository. Uses ripgrep when available and a JavaScript fallback otherwise.',
      inputSchema: z.object({
        query: z.string().min(1),
        glob: z.string().optional(),
        limit: z.number().int().min(1).max(1_000).optional(),
      }),
      execute: async (input) => await searchRepository(options.root, input),
    }),
    search_repository: tool({
      description:
        'Search code and text across the repository, returning files, line numbers, and excerpts.',
      inputSchema: z.object({
        query: z.string().min(1),
        glob: z.string().optional(),
        limit: z.number().int().min(1).max(1_000).optional(),
      }),
      execute: async (input) => await searchRepository(options.root, input),
    }),
    bash: tool({
      description:
        'Run a program without an implicit shell. Supply the executable and each argument separately.',
      inputSchema: z.object({
        command: z.string().min(1),
        args: z.array(z.string()).default([]),
        cwd: z.string().optional(),
        timeoutMs: z.number().int().min(100).max(600_000).default(120_000),
      }),
      execute: async ({ command, args, cwd, timeoutMs }) => {
        const display = [command, ...args].join(' ');
        const kind = options.permissions.classifyShell(display);
        await options.permissions.check({
          kind,
          tool: 'bash',
          command: display,
          description: `run ${display}`,
        });
        const working = cwd ? path.resolve(options.root, cwd) : options.root;
        if (working !== options.root && !working.startsWith(`${options.root}${path.sep}`))
          throw new Error('Shell working directory escapes repository root.');
        const result = await runProcess(command, args, {
          cwd: working,
          timeoutMs,
          signal: signal(),
        });
        const signature = JSON.stringify({ command, args, cwd });
        if (result.exitCode !== 0) {
          const count = (failures.get(signature) ?? 0) + 1;
          failures.set(signature, count);
          if (count >= 3)
            throw new Error(
              `Stopped repeated failing command after ${count} attempts: ${display}\n${result.stderr}`,
            );
        } else failures.delete(signature);
        return result;
      },
    }),
    git_status: tool({
      description: 'Inspect short Git status.',
      inputSchema: z.object({}),
      execute: async () => await git(['status', '--short', '--branch']),
    }),
    git_diff: tool({
      description: 'Inspect Git diff without modifying the repository.',
      inputSchema: z.object({
        staged: z.boolean().default(false),
        path: z.string().optional(),
      }),
      execute: async ({ staged, path: requested }) =>
        await git([
          'diff',
          ...(staged ? ['--cached'] : []),
          ...(requested ? ['--', requested] : []),
        ]),
    }),
    git_log: tool({
      description: 'Inspect recent Git commits.',
      inputSchema: z.object({ limit: z.number().int().min(1).max(100).default(20) }),
      execute: async ({ limit }) =>
        await git(['log', `-${limit}`, '--oneline', '--decorate']),
    }),
    git_show: tool({
      description: 'Inspect a Git object or commit.',
      inputSchema: z.object({
        revision: z.string().default('HEAD'),
        path: z.string().optional(),
      }),
      execute: async ({ revision, path: requested }) =>
        await git([
          'show',
          '--stat',
          '--oneline',
          revision,
          ...(requested ? ['--', requested] : []),
        ]),
    }),
    diagnostics: tool({
      description:
        'Run the project type checker or nearest practical diagnostics command.',
      inputSchema: z.object({}),
      execute: async () => {
        const candidates: Array<[string, string, string[]]> = [
          ['package.json', 'npm', ['run', 'typecheck', '--if-present']],
          ['tsconfig.json', 'npx', ['tsc', '--noEmit']],
          ['Cargo.toml', 'cargo', ['check']],
          ['go.mod', 'go', ['test', './...']],
        ];
        for (const [marker, executable, args] of candidates) {
          try {
            await access(path.join(options.root, marker));
            await options.permissions.check({
              kind: 'read',
              tool: 'diagnostics',
              description: `run ${executable} ${args.join(' ')}`,
            });
            return await runProcess(executable, args, {
              cwd: options.root,
              timeoutMs: 120_000,
              signal: signal(),
            });
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
          }
        }
        return {
          skipped: true,
          reason: 'No supported project diagnostics configuration was detected.',
        };
      },
    }),
  } satisfies ToolSet;

  return { tools, journal, sessionDiff: () => sessionDiff(ctx) };
}
