import path from 'node:path';
import { runProcess } from '../utils/process.js';

export interface GitInfo {
  isRepository: boolean;
  root: string;
  branch?: string;
  status: string;
}

export async function inspectGit(cwd: string): Promise<GitInfo> {
  const top = await runProcess('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    timeoutMs: 5_000,
  });
  if (top.exitCode !== 0)
    return { isRepository: false, root: path.resolve(cwd), status: '' };
  const root = top.stdout.trim();
  const [branch, status] = await Promise.all([
    runProcess('git', ['branch', '--show-current'], { cwd: root, timeoutMs: 5_000 }),
    runProcess('git', ['status', '--short'], { cwd: root, timeoutMs: 5_000 }),
  ]);
  return {
    isRepository: true,
    root,
    branch: branch.stdout.trim() || 'detached',
    status: status.stdout,
  };
}
