import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const dataDirectory = path.join(tmpdir(), `opencodekit-cli-tests-${process.pid}`);
async function cli(
  args: string[],
  stdin?: string,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return await new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      ['--import', 'tsx', 'src/cli/index.ts', ...args],
      {
        cwd: root,
        env: { ...process.env, OPENCODEKIT_DATA_DIR: dataDirectory },
      },
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', reject);
    child.on('close', (code) => resolve({ stdout, stderr, code }));
    child.stdin.end(stdin);
  });
}

describe('CLI headless mode', () => {
  it('prints help', async () => {
    const result = await cli(['--help']);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('opencodekit');
  });
  it('supports text output', async () => {
    const result = await cli([
      '-p',
      'say hello',
      '--provider',
      'mock',
      '--model',
      'mock',
    ]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Hello from OpenCodeKit');
  });
  it('supports stable JSON output', async () => {
    const result = await cli([
      '-p',
      'hello',
      '--provider',
      'mock',
      '--model',
      'mock',
      '--output',
      'json',
    ]);
    expect(JSON.parse(result.stdout)).toMatchObject({
      version: 1,
      provider: 'mock',
      model: 'mock',
    });
  });
  it('supports stream JSON and piped context', async () => {
    const result = await cli(
      [
        '-p',
        'review',
        '--provider',
        'mock',
        '--model',
        'mock',
        '--output',
        'stream-json',
      ],
      'untrusted input',
    );
    const lines = result.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { type: string });
    expect(lines.at(-1)?.type).toBe('finish');
  });
  it('reports invalid arguments', async () => {
    const result = await cli(['--output', 'xml']);
    expect(result.code).toBe(1);
    expect(result.stderr.toLowerCase()).toContain('allowed choices');
  });
});
