import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { CredentialStore } from '../src/auth/store.js';

describe('CredentialStore', () => {
  it('falls back to a private 0600 credential file', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'opencodekit-auth-'));
    const store = new CredentialStore(directory, false);
    await expect(store.set('openai', 'sk-private')).resolves.toBe('private-file');
    expect(await store.get('openai')).toBe('sk-private');
    expect((await stat(store.location())).mode & 0o777).toBe(0o600);
    expect((await stat(directory)).mode & 0o777).toBe(0o700);
    expect(await readFile(store.location(), 'utf8')).toContain('sk-private');
  });

  it('deletes fallback credentials without affecting other providers', async () => {
    const directory = await mkdtemp(path.join(tmpdir(), 'opencodekit-auth-'));
    const store = new CredentialStore(directory, false);
    await store.set('openai', 'one');
    await store.set('anthropic', 'two');
    await store.delete('openai');
    expect(await store.get('openai')).toBeUndefined();
    expect(await store.get('anthropic')).toBe('two');
  });
});
