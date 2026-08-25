import { readFile } from 'node:fs/promises';
import path from 'node:path';
import envPaths from 'env-paths';
import { ZodError } from 'zod';
import { configSchema, type AppConfig } from './schema.js';

const paths = envPaths('opencodekit');

export function globalConfigDirectory(): string {
  return process.env.OPENCODEKIT_CONFIG_DIR ?? paths.config;
}

export function dataDirectory(): string {
  return process.env.OPENCODEKIT_DATA_DIR ?? paths.data;
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    if (error instanceof SyntaxError)
      throw new Error(`Invalid JSON in ${file}: ${error.message}`, { cause: error });
    throw error;
  }
}

function merge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const current = result[key];
    result[key] =
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      current &&
      typeof current === 'object' &&
      !Array.isArray(current)
        ? merge(current as Record<string, unknown>, value as Record<string, unknown>)
        : value;
  }
  return result;
}

export async function loadConfig(root: string): Promise<AppConfig> {
  const globalFile = path.join(globalConfigDirectory(), 'config.json');
  const repoFile = path.join(root, '.opencodekit', 'config.json');
  try {
    const globalConfig = (await readJson(globalFile)) as Record<string, unknown>;
    const repoConfig = (await readJson(repoFile)) as Record<string, unknown>;
    return configSchema.parse(merge(globalConfig, repoConfig));
  } catch (error) {
    if (error instanceof ZodError) {
      const details = error.issues
        .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
        .join('\n');
      throw new Error(`Invalid opencodekit configuration:\n${details}`, { cause: error });
    }
    throw error;
  }
}
