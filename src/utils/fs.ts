import { lstat, mkdir, readFile, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

export async function resolveInside(
  root: string,
  requested: string,
  allowMissing = false,
): Promise<string> {
  const rootReal = await realpath(root);
  const absolute = path.resolve(rootReal, requested);
  if (absolute !== rootReal && !absolute.startsWith(`${rootReal}${path.sep}`)) {
    throw new Error(`Path escapes repository root: ${requested}`);
  }
  let existing = absolute;
  while (allowMissing) {
    try {
      existing = await realpath(existing);
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = path.dirname(existing);
      if (parent === existing) break;
      existing = parent;
    }
  }
  try {
    const checked = await realpath(existing);
    if (checked !== rootReal && !checked.startsWith(`${rootReal}${path.sep}`)) {
      throw new Error(`Path resolves outside repository root: ${requested}`);
    }
  } catch (error) {
    if (!allowMissing || (error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return absolute;
}

export async function atomicWrite(
  file: string,
  content: string,
  mode?: number,
): Promise<void> {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.opencodekit-${process.pid}-${Date.now()}.tmp`;
  await writeFile(temporary, content, {
    encoding: 'utf8',
    ...(mode === undefined ? {} : { mode }),
  });
  await rename(temporary, file);
}

export function isBinary(buffer: Buffer): boolean {
  const sample = buffer.subarray(0, Math.min(buffer.length, 8_000));
  return sample.includes(0);
}

export async function readText(file: string): Promise<string> {
  const buffer = await readFile(file);
  if (isBinary(buffer)) throw new Error(`Binary file cannot be read as text: ${file}`);
  return buffer.toString('utf8');
}

export async function exists(file: string): Promise<boolean> {
  try {
    await lstat(file);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}
