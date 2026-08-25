import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ModelMessage } from 'ai';
import { dataDirectory } from '../config/load.js';
import { atomicWrite } from '../utils/fs.js';
import { debug } from '../utils/logger.js';

export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  estimatedCost?: number;
}

export interface Session {
  id: string;
  repository: string;
  provider: string;
  model: string;
  mode: string;
  createdAt: string;
  updatedAt: string;
  parentId?: string;
  messages: ModelMessage[];
  summaries: string[];
  usage: SessionUsage;
}

interface Database {
  version: 1;
  sessions: Session[];
}

export class SessionStore {
  private readonly file: string;
  private writeChain: Promise<void> = Promise.resolve();

  constructor(directory = dataDirectory()) {
    this.file = path.join(directory, 'sessions.json');
  }

  private async database(): Promise<Database> {
    try {
      return JSON.parse(await readFile(this.file, 'utf8')) as Database;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT')
        return { version: 1, sessions: [] };
      throw error;
    }
  }

  private async persist(database: Database): Promise<void> {
    await mkdir(path.dirname(this.file), { recursive: true });
    this.writeChain = this.writeChain.then(
      async () => await atomicWrite(this.file, `${JSON.stringify(database, null, 2)}\n`),
    );
    await this.writeChain;
  }

  async create(
    repository: string,
    provider: string,
    model: string,
    mode: string,
  ): Promise<Session> {
    const now = new Date().toISOString();
    const session: Session = {
      id: randomUUID(),
      repository,
      provider,
      model,
      mode,
      createdAt: now,
      updatedAt: now,
      messages: [],
      summaries: [],
      usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0 },
    };
    const database = await this.database();
    database.sessions.push(session);
    await this.persist(database);
    debug('session.create', { sessionId: session.id, repository, provider, model });
    return session;
  }

  async save(session: Session): Promise<void> {
    session.updatedAt = new Date().toISOString();
    const database = await this.database();
    const index = database.sessions.findIndex((item) => item.id === session.id);
    if (index >= 0) database.sessions[index] = session;
    else database.sessions.push(session);
    await this.persist(database);
    debug('session.save', { sessionId: session.id, messages: session.messages.length });
  }

  async get(id: string): Promise<Session | undefined> {
    return (await this.database()).sessions.find((session) => session.id === id);
  }

  async list(repository?: string): Promise<Session[]> {
    const sessions = (await this.database()).sessions;
    return sessions
      .filter((session) => !repository || session.repository === repository)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async latest(repository: string): Promise<Session | undefined> {
    return (await this.list(repository))[0];
  }

  async fork(id: string): Promise<Session> {
    const source = await this.get(id);
    if (!source) throw new Error(`Session not found: ${id}`);
    const session = await this.create(
      source.repository,
      source.provider,
      source.model,
      source.mode,
    );
    session.parentId = source.id;
    session.messages = structuredClone(source.messages);
    session.summaries = [...source.summaries];
    session.usage = { ...source.usage };
    await this.save(session);
    return session;
  }

  async compact(session: Session, summary: string): Promise<void> {
    const recent = session.messages.slice(-12);
    session.messages = [
      { role: 'system', content: `Compacted session summary:\n${summary}` },
      ...recent,
    ];
    session.summaries.push(summary);
    await this.save(session);
  }
}
