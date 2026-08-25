import { spawn } from 'node:child_process';
import { chmod, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { dataDirectory } from '../config/load.js';
import { atomicWrite } from '../utils/fs.js';
import { runProcess } from '../utils/process.js';

const service = 'opencodekit';

const commandChecks = new Map<string, Promise<boolean>>();

async function commandExists(command: string): Promise<boolean> {
  const cached = commandChecks.get(command);
  if (cached) return await cached;
  const check = runProcess(process.platform === 'win32' ? 'where' : 'which', [command], {
    cwd: process.cwd(),
    timeoutMs: 2_000,
  }).then((result) => result.exitCode === 0);
  commandChecks.set(command, check);
  return await check;
}

export class CredentialStore {
  private readonly directory: string;
  private readonly file: string;

  constructor(
    directory = dataDirectory(),
    private readonly keychainEnabled = true,
  ) {
    this.directory = directory;
    this.file = path.join(directory, 'credentials.json');
  }

  private async readFallback(): Promise<Record<string, string>> {
    try {
      const value = JSON.parse(await readFile(this.file, 'utf8')) as unknown;
      if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
      return Object.fromEntries(
        Object.entries(value).filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string',
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
      throw new Error(`Could not read the private credential file: ${this.file}`, {
        cause: error,
      });
    }
  }

  private async writeFallback(credentials: Record<string, string>): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    await atomicWrite(this.file, `${JSON.stringify(credentials, null, 2)}\n`, 0o600);
    await chmod(this.file, 0o600);
  }

  async get(provider: string): Promise<string | undefined> {
    if (
      this.keychainEnabled &&
      process.platform === 'darwin' &&
      (await commandExists('security'))
    ) {
      const result = await runProcess(
        'security',
        ['find-generic-password', '-a', provider, '-s', service, '-w'],
        { cwd: process.cwd(), timeoutMs: 5_000 },
      );
      if (result.exitCode === 0 && result.stdout.trim()) return result.stdout.trim();
    }
    if (
      this.keychainEnabled &&
      process.platform === 'linux' &&
      (await commandExists('secret-tool'))
    ) {
      const result = await runProcess(
        'secret-tool',
        ['lookup', 'service', service, 'provider', provider],
        { cwd: process.cwd(), timeoutMs: 5_000 },
      );
      if (result.exitCode === 0 && result.stdout.trim()) return result.stdout.trim();
    }
    return (await this.readFallback())[provider];
  }

  async set(provider: string, key: string): Promise<'keychain' | 'private-file'> {
    if (
      this.keychainEnabled &&
      process.platform === 'darwin' &&
      (await commandExists('security'))
    ) {
      const result = await runProcess(
        'security',
        ['add-generic-password', '-U', '-a', provider, '-s', service, '-w', key],
        { cwd: process.cwd(), timeoutMs: 5_000 },
      );
      if (result.exitCode === 0) return 'keychain';
    }
    if (
      this.keychainEnabled &&
      process.platform === 'linux' &&
      (await commandExists('secret-tool'))
    ) {
      const stored = await new Promise<boolean>((resolve) => {
        const child = spawn(
          'secret-tool',
          [
            'store',
            '--label',
            `OpenCodeKit ${provider}`,
            'service',
            service,
            'provider',
            provider,
          ],
          { stdio: ['pipe', 'ignore', 'ignore'] },
        );
        child.stdin.end(key);
        child.on('error', () => resolve(false));
        child.on('close', (code) => resolve(code === 0));
      });
      if (stored) return 'keychain';
    }
    const credentials = await this.readFallback();
    credentials[provider] = key;
    await this.writeFallback(credentials);
    return 'private-file';
  }

  async delete(provider: string): Promise<void> {
    let keychainHandled = false;
    if (
      this.keychainEnabled &&
      process.platform === 'darwin' &&
      (await commandExists('security'))
    ) {
      await runProcess(
        'security',
        ['delete-generic-password', '-a', provider, '-s', service],
        { cwd: process.cwd(), timeoutMs: 5_000 },
      );
      keychainHandled = true;
    }
    if (
      this.keychainEnabled &&
      process.platform === 'linux' &&
      (await commandExists('secret-tool'))
    ) {
      await runProcess(
        'secret-tool',
        ['clear', 'service', service, 'provider', provider],
        { cwd: process.cwd(), timeoutMs: 5_000 },
      );
      keychainHandled = true;
    }
    const credentials = await this.readFallback();
    if (provider in credentials) {
      Reflect.deleteProperty(credentials, provider);
      await this.writeFallback(credentials);
      return;
    }
    if (!keychainHandled)
      throw new Error(`No stored credential was found for ${provider}.`);
  }

  location(): string {
    return this.file;
  }
}
