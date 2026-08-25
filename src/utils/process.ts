import { spawn } from 'node:child_process';

export interface ProcessResult {
  command: string;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
}

export async function runProcess(
  command: string,
  args: string[],
  options: {
    cwd: string;
    timeoutMs?: number;
    signal?: AbortSignal;
    maxOutput?: number;
    env?: NodeJS.ProcessEnv;
  },
): Promise<ProcessResult> {
  const maxOutput = options.maxOutput ?? 200_000;
  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env ?? process.env,
      shell: false,
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let truncated = false;
    let timedOut = false;
    const append = (current: string, chunk: Buffer): string => {
      if (current.length >= maxOutput) {
        truncated = true;
        return current;
      }
      const next = current + chunk.toString('utf8');
      if (next.length > maxOutput) truncated = true;
      return next.slice(0, maxOutput);
    };
    child.stdout.on('data', (chunk: Buffer) => (stdout = append(stdout, chunk)));
    child.stderr.on('data', (chunk: Buffer) => (stderr = append(stderr, chunk)));
    child.on('error', reject);
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          setTimeout(() => child.kill('SIGKILL'), 1_000).unref();
        }, options.timeoutMs)
      : undefined;
    timer?.unref();
    const abort = () => child.kill('SIGTERM');
    options.signal?.addEventListener('abort', abort, { once: true });
    child.on('close', (exitCode) => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      resolve({
        command: [command, ...args].join(' '),
        stdout,
        stderr,
        exitCode,
        timedOut,
        truncated,
      });
    });
  });
}
