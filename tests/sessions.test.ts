import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { SessionStore } from '../src/sessions/store.js';

describe('SessionStore', () => {
  let store: SessionStore;
  beforeEach(async () => {
    store = new SessionStore(await mkdtemp(path.join(tmpdir(), 'opencodekit-sessions-')));
  });

  it('creates, saves, resumes, and continues sessions', async () => {
    const session = await store.create('/repo', 'mock', 'mock', 'ask');
    session.messages.push({ role: 'user', content: 'hello' });
    await store.save(session);
    expect((await store.get(session.id))?.messages).toHaveLength(1);
    expect((await store.latest('/repo'))?.id).toBe(session.id);
  });

  it('forks without changing the original', async () => {
    const original = await store.create('/repo', 'mock', 'mock', 'ask');
    original.messages.push({ role: 'user', content: 'original' });
    await store.save(original);
    const fork = await store.fork(original.id);
    fork.messages.push({ role: 'user', content: 'fork only' });
    await store.save(fork);
    expect(fork.parentId).toBe(original.id);
    expect((await store.get(original.id))?.messages).toHaveLength(1);
  });

  it('persists compaction summaries and recent context', async () => {
    const session = await store.create('/repo', 'mock', 'mock', 'ask');
    for (let index = 0; index < 20; index += 1)
      session.messages.push({ role: 'user', content: String(index) });
    await store.compact(session, 'important decisions');
    const saved = await store.get(session.id);
    expect(saved?.summaries).toEqual(['important decisions']);
    expect(saved?.messages).toHaveLength(13);
  });
});
