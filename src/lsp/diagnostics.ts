import path from 'node:path';
import { access } from 'node:fs/promises';
import { runProcess, type ProcessResult } from '../utils/process.js';

export async function runDiagnostics(
  root: string,
  signal?: AbortSignal,
): Promise<ProcessResult | undefined> {
  const choices: Array<{ marker: string; command: string; args: string[] }> = [
    {
      marker: 'tsconfig.json',
      command: 'npx',
      args: ['tsc', '--noEmit', '--pretty', 'false'],
    },
    {
      marker: 'Cargo.toml',
      command: 'cargo',
      args: ['check', '--message-format', 'short'],
    },
    { marker: 'go.mod', command: 'go', args: ['test', './...'] },
  ];
  for (const choice of choices) {
    try {
      await access(path.join(root, choice.marker));
      return await runProcess(choice.command, choice.args, {
        cwd: root,
        timeoutMs: 120_000,
        signal,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return undefined;
}
