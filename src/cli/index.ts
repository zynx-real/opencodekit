import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { Command, Option } from 'commander';
import { inspectGit } from '../git/index.js';
import { loadConfig, globalConfigDirectory } from '../config/load.js';
import type { AppConfig, PermissionMode } from '../config/schema.js';
import { AgentRunner } from '../agent/runner.js';
import { ApprovalController } from '../tui/approval.js';
import { runTui } from '../tui/index.js';
import { clearTerminal } from '../tui/terminal.js';
import { SessionStore } from '../sessions/store.js';
import { ProviderRegistry } from '../providers/registry.js';
import { CredentialStore } from '../auth/store.js';
import { atomicWrite } from '../utils/fs.js';
import { MCPManager } from '../mcp/manager.js';
import packageJson from '../../package.json' with { type: 'json' };

interface MainOptions {
  prompt?: string;
  output: 'text' | 'json' | 'stream-json';
  provider?: string;
  model?: string;
  permissionMode?: PermissionMode;
  continue?: boolean;
  resume?: string;
  fork?: string;
  verbose?: boolean;
  clear?: boolean;
}

async function pipedInput(): Promise<string> {
  if (process.stdin.isTTY) return '';
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
  return Buffer.concat(chunks).toString('utf8').slice(0, 2_000_000);
}

function ensureSelection(config: AppConfig, interactive: boolean): void {
  if (config.model) return;
  if (interactive) return;
  throw new Error(
    `No model selected. Pass --model or set "model" in .opencodekit/config.json.`,
  );
}

async function selectSession(store: SessionStore, root: string, options: MainOptions) {
  const session = options.fork
    ? await store.fork(options.fork)
    : options.resume
      ? await store.get(options.resume)
      : options.continue
        ? await store.latest(root)
        : undefined;
  if ((options.resume || options.fork) && !session)
    throw new Error(`Session not found: ${options.resume ?? options.fork}`);
  if (session && session.repository !== root)
    throw new Error(
      `Session ${session.id} belongs to ${session.repository}, not ${root}.`,
    );
  return session;
}

async function mainAction(options: MainOptions): Promise<void> {
  if (options.verbose) process.env.OPENCODEKIT_LOG = 'debug';
  if (
    !options.prompt &&
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    options.clear !== false
  )
    clearTerminal(process.stdout);
  const git = await inspectGit(process.cwd());
  const root = git.root;
  const config = await loadConfig(root);
  if (options.provider) config.provider = options.provider;
  if (options.model) config.model = options.model;
  if (options.permissionMode) config.permissions.mode = options.permissionMode;
  ensureSelection(config, !options.prompt && process.stdin.isTTY);
  const store = new SessionStore();
  const session = await selectSession(store, root, options);
  if (session && options.provider) session.provider = options.provider;
  if (session && options.model) session.model = options.model;
  const approvals = new ApprovalController();
  const runner = await AgentRunner.create({
    root,
    config,
    git,
    ...(session ? { session } : {}),
    ...(!options.prompt ? { approve: approvals.handler } : {}),
  });
  if (!options.prompt) {
    await runTui(runner, approvals);
    return;
  }
  const stdin = await pipedInput();
  const prompt = stdin
    ? `${options.prompt}\n\n<untrusted-piped-input>\n${stdin}\n</untrusted-piped-input>`
    : options.prompt;
  try {
    const text = await runner.run(prompt, {
      onText(delta) {
        if (options.output === 'stream-json')
          process.stdout.write(`${JSON.stringify({ type: 'text-delta', delta })}\n`);
        else if (options.output === 'text') process.stdout.write(delta);
      },
      onTool(event) {
        if (options.output === 'stream-json')
          process.stdout.write(
            `${JSON.stringify({ type: `tool-${event.phase}`, tool: event.tool, input: event.input, output: event.output, elapsedMs: event.elapsedMs })}\n`,
          );
      },
      onFallback(from, to, reason) {
        if (options.output === 'stream-json')
          process.stdout.write(
            `${JSON.stringify({ type: 'fallback', from, to, reason })}\n`,
          );
        else process.stderr.write(`Provider fallback: ${from} → ${to}\n`);
      },
    });
    if (options.output === 'text') process.stdout.write(text.endsWith('\n') ? '' : '\n');
    if (options.output === 'json')
      process.stdout.write(
        `${JSON.stringify({ version: 1, sessionId: runner.getSession().id, provider: runner.getProvider(), model: runner.getModel(), text, usage: runner.getSession().usage })}\n`,
      );
    if (options.output === 'stream-json')
      process.stdout.write(
        `${JSON.stringify({ type: 'finish', sessionId: runner.getSession().id, usage: runner.getSession().usage })}\n`,
      );
  } finally {
    await runner.close();
  }
}

async function readSecret(label: string): Promise<string> {
  if (!process.stdin.isTTY)
    throw new Error('Credential entry requires an interactive terminal.');
  process.stdout.write(label);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return await new Promise((resolve, reject) => {
    let value = '';
    const onData = (chunk: Buffer) => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\u0003') {
          cleanup();
          reject(new Error('Cancelled.'));
          return;
        }
        if (character === '\r' || character === '\n') {
          cleanup();
          process.stdout.write('\n');
          resolve(value);
          return;
        }
        if (character === '\u007f') value = value.slice(0, -1);
        else value += character;
      }
    };
    const cleanup = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
    };
    process.stdin.on('data', onData);
  });
}

async function updateGlobalConfig(
  mutator: (config: Record<string, unknown>) => void,
): Promise<void> {
  const file = path.join(globalConfigDirectory(), 'config.json');
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(await readFile(file, 'utf8')) as Record<string, unknown>;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  mutator(config);
  await atomicWrite(file, `${JSON.stringify(config, null, 2)}\n`);
}

const program = new Command();
program
  .name('opencodekit')
  .description('A provider-neutral, permission-aware AI coding agent for the terminal')
  .version(packageJson.version)
  .option('-p, --prompt <text>', 'run headlessly with a prompt')
  .addOption(
    new Option('--output <format>', 'headless output format')
      .choices(['text', 'json', 'stream-json'])
      .default('text'),
  )
  .option('--provider <id>', 'provider to use')
  .option('--model <id>', 'model to use')
  .addOption(
    new Option('--permission-mode <mode>', 'permission mode').choices([
      'ask',
      'auto-edit',
      'plan',
      'unrestricted',
    ]),
  )
  .option('-c, --continue', 'continue the latest session for this repository')
  .option('--resume <session-id>', 'resume a session')
  .option('--fork <session-id>', 'fork a session')
  .option('--verbose', 'write debug diagnostics to stderr')
  .option('--no-clear', 'preserve terminal contents and scrollback on startup')
  .action(async (options: MainOptions) => await mainAction(options));

program
  .command('models [provider]')
  .description('list dynamically discovered or configured models')
  .action(async (provider?: string) => {
    const git = await inspectGit(process.cwd());
    const config = await loadConfig(git.root);
    const selected = provider ?? config.provider;
    const registry = new ProviderRegistry(config);
    const models = await registry.listModels(selected);
    if (!models.length)
      process.stdout.write(
        `No dynamic model list is available for ${selected}. Configure providers.${selected}.models or pass --model.\n`,
      );
    else process.stdout.write(`${models.join('\n')}\n`);
  });

const sessions = program.command('sessions').description('list saved sessions');
sessions.action(async () => {
  const git = await inspectGit(process.cwd());
  const items = await new SessionStore().list(git.root);
  process.stdout.write(
    items.length
      ? `${items.map((item) => `${item.id}\t${item.updatedAt}\t${item.provider}/${item.model}`).join('\n')}\n`
      : 'No sessions for this repository.\n',
  );
});

const auth = program
  .command('auth')
  .description('manage provider credentials in the OS keychain');
auth.command('login <provider>').action(async (provider: string) => {
  const key = await readSecret(`${provider} API key (input hidden): `);
  if (!key) throw new Error('Credential cannot be empty.');
  const store = new CredentialStore();
  const backend = await store.set(provider, key);
  process.stdout.write(
    backend === 'keychain'
      ? `Stored ${provider} credential in the OS credential store.\n`
      : `Stored ${provider} credential in ${store.location()} with mode 0600.\n`,
  );
});
auth.command('list').action(async () => {
  const config = await loadConfig(process.cwd());
  const registry = new ProviderRegistry(config);
  for (const provider of registry.list()) {
    const configured = Boolean(await registry.credential(provider.id));
    process.stdout.write(
      `${provider.id.padEnd(14)} ${configured ? 'configured' : 'not configured'}${provider.env ? ` (${provider.env})` : ''}\n`,
    );
  }
});
auth.command('logout <provider>').action(async (provider: string) => {
  await new CredentialStore().delete(provider);
  process.stdout.write(`Removed ${provider} credential from the OS credential store.\n`);
});

const mcp = program.command('mcp').description('manage Model Context Protocol servers');
mcp.command('list').action(async () => {
  const config = await loadConfig(process.cwd());
  const rows = new MCPManager(config).configured();
  process.stdout.write(
    rows.length
      ? `${rows.map((item) => `${item.name}\t${item.transport}\t${item.enabled ? 'enabled' : 'disabled'}`).join('\n')}\n`
      : 'No MCP servers configured.\n',
  );
});
mcp
  .command('add <name>')
  .requiredOption('--transport <type>', 'stdio or http')
  .option('--command <command>', 'stdio executable')
  .option('--arg <arg...>', 'stdio arguments')
  .option('--url <url>', 'Streamable HTTP URL')
  .action(
    async (
      name: string,
      options: { transport: string; command?: string; arg?: string[]; url?: string },
    ) => {
      if (options.transport !== 'stdio' && options.transport !== 'http')
        throw new Error('--transport must be stdio or http.');
      const server =
        options.transport === 'stdio'
          ? {
              transport: 'stdio',
              command: options.command,
              args: options.arg ?? [],
              env: {},
              enabled: true,
            }
          : { transport: 'http', url: options.url, headers: {}, enabled: true };
      if (options.transport === 'stdio' && !options.command)
        throw new Error('--command is required for stdio.');
      if (options.transport === 'http' && !options.url)
        throw new Error('--url is required for http.');
      await updateGlobalConfig((config) => {
        const servers = (config.mcp ?? {}) as Record<string, unknown>;
        servers[name] = server;
        config.mcp = servers;
      });
      process.stdout.write(`Added MCP server ${name}.\n`);
    },
  );
mcp.command('remove <name>').action(async (name: string) => {
  await updateGlobalConfig((config) => {
    const servers = (config.mcp ?? {}) as Record<string, unknown>;
    Reflect.deleteProperty(servers, name);
    config.mcp = servers;
  });
  process.stdout.write(`Removed MCP server ${name}.\n`);
});
mcp.command('test').action(async () => {
  const config = await loadConfig(process.cwd());
  const manager = new MCPManager(config);
  try {
    const result = await manager.connectAll();
    process.stdout.write(
      `${result.connections.map((item) => `${item.name}: ${item.server} ${item.version}, ${item.tools.length} tools`).join('\n')}\n`,
    );
  } finally {
    await manager.close();
  }
});

program.parseAsync().catch((error: unknown) => {
  process.stderr.write(
    `opencodekit: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
