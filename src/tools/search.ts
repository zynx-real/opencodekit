import { access } from 'node:fs/promises';
import path from 'node:path';
import fg from 'fast-glob';
import { readText } from '../utils/fs.js';
import { runProcess } from '../utils/process.js';

const ignore = [
  '.git',
  'node_modules',
  'dist',
  'build',
  'target',
  '.next',
  '.venv',
  '__pycache__',
];

async function hasRipgrep(): Promise<boolean> {
  try {
    await access('/usr/bin/rg');
    return true;
  } catch {
    const check = await runProcess(
      process.platform === 'win32' ? 'where' : 'which',
      ['rg'],
      { cwd: process.cwd(), timeoutMs: 1_000 },
    );
    return check.exitCode === 0;
  }
}

export async function searchRepository(
  root: string,
  input: { query: string; glob?: string; limit?: number },
): Promise<object> {
  const limit = input.limit ?? 200;
  if (await hasRipgrep()) {
    const args = [
      '--line-number',
      '--column',
      '--no-heading',
      '--color',
      'never',
      '--smart-case',
      '--max-count',
      String(limit),
    ];
    for (const directory of ignore) args.push('--glob', `!${directory}/**`);
    if (input.glob) args.push('--glob', input.glob);
    args.push('--', input.query, '.');
    const result = await runProcess('rg', args, {
      cwd: root,
      timeoutMs: 15_000,
      maxOutput: 100_000,
    });
    if (result.exitCode !== 0 && result.exitCode !== 1)
      throw new Error(result.stderr || 'ripgrep failed');
    const matches = result.stdout
      .split('\n')
      .filter(Boolean)
      .slice(0, limit)
      .map((line) => {
        const match = /^(.+?):(\d+):(\d+):(.*)$/.exec(line);
        return match
          ? {
              file: match[1],
              line: Number(match[2]),
              column: Number(match[3]),
              excerpt: match[4],
            }
          : { excerpt: line };
      });
    return { engine: 'ripgrep', matches, truncated: matches.length >= limit };
  }
  const files = await fg(input.glob ?? '**/*', {
    cwd: root,
    onlyFiles: true,
    dot: true,
    ignore: ignore.map((item) => `**/${item}/**`),
    followSymbolicLinks: false,
  });
  const needle = input.query.toLowerCase();
  const matches: Array<{ file: string; line: number; excerpt: string }> = [];
  for (const file of files) {
    try {
      const lines = (await readText(path.join(root, file))).split(/\r?\n/);
      for (let index = 0; index < lines.length && matches.length < limit; index += 1) {
        if (lines[index]?.toLowerCase().includes(needle))
          matches.push({ file, line: index + 1, excerpt: lines[index] ?? '' });
      }
    } catch {
      /* binary or unreadable files are skipped */
    }
    if (matches.length >= limit) break;
  }
  return { engine: 'javascript', matches, truncated: matches.length >= limit };
}
