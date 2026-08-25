import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import type { AgentRunner } from '../agent/runner.js';
import { CredentialStore } from '../auth/store.js';
import type { PermissionMode } from '../config/schema.js';
import type { AvailableModel, ModelDiscoveryResult } from '../providers/registry.js';
import type { ApprovalController, PendingApproval } from './approval.js';
import { commandSuggestions } from './commands.js';
import { Splash } from './logo.js';
import { ModelPicker } from './model-picker.js';
import { PromptInput } from './prompt-input.js';

interface Entry {
  id: number;
  role: 'user' | 'assistant' | 'tool' | 'error' | 'info';
  content: string;
}

function formatTool(tool: string, input: unknown): string {
  if (!input || typeof input !== 'object') return `● ${tool}`;
  const record = input as Record<string, unknown>;
  const value = record.path ?? record.query ?? record.command;
  const detail =
    typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return `● ${tool}${detail ? ` ${detail}` : ''}`;
}

export function App({
  runner,
  approvals,
}: {
  runner: AgentRunner;
  approvals: ApprovalController;
}): React.ReactNode {
  const { exit } = useApp();
  const [ready, setReady] = useState(false);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [pending, setPending] = useState<PendingApproval>();
  const [secretProvider, setSecretProvider] = useState<string>();
  const [knownModels, setKnownModels] = useState<string[]>([]);
  const [picker, setPicker] = useState<
    (ModelDiscoveryResult & { loading: boolean }) | undefined
  >(runner.getModel() ? undefined : { loading: true, models: [], errors: [] });
  const [connection, setConnection] = useState<'idle' | 'testing' | 'online' | 'error'>(
    'idle',
  );
  const counter = useRef(0);
  const controller = useRef<AbortController | undefined>(undefined);
  const startedAt = useRef(0);
  const credentials = useMemo(() => new CredentialStore(), []);
  const providerIds = useMemo(
    () => runner.registry.list().map((provider) => provider.id),
    [runner],
  );
  const suggest = useCallback(
    (value: string) =>
      commandSuggestions(value, { providers: providerIds, models: knownModels }),
    [knownModels, providerIds],
  );
  const add = (role: Entry['role'], content: string) =>
    setEntries((current) => [...current, { id: counter.current++, role, content }]);
  const openModelPicker = useCallback(async () => {
    setPicker({ loading: true, models: [], errors: [] });
    try {
      const result = await runner.registry.listAvailableModels(
        runner.getProvider(),
        runner.getModel(),
      );
      setPicker({ loading: false, ...result });
    } catch (error) {
      setPicker({
        loading: false,
        models: [],
        errors: [
          {
            provider: 'discovery',
            message: error instanceof Error ? error.message : String(error),
          },
        ],
      });
    }
  }, [runner]);
  const selectModel = useCallback(
    async (model: AvailableModel) => {
      setRunning(true);
      try {
        await runner.setProvider(model.provider);
        await runner.setModel(model.id);
        setKnownModels(
          picker?.models
            .filter((item) => item.provider === model.provider)
            .map((item) => item.id) ?? [],
        );
        setConnection('idle');
        setPicker(undefined);
        add('info', `Model: ${model.id} · Provider: ${model.provider}`);
      } catch (error) {
        add('error', error instanceof Error ? error.message : String(error));
      } finally {
        setRunning(false);
      }
    },
    [picker?.models, runner],
  );

  useEffect(() => approvals.subscribe(setPending), [approvals]);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 850);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!ready || entries.length) return;
    add(
      'info',
      runner.getModel()
        ? 'Ready. Type a task or /help — Tab completes commands.'
        : `Select a model, or press Esc and run /auth ${runner.getProvider()} to connect one.`,
    );
    if (!runner.getModel()) void openModelPicker();
  }, [ready]);
  useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)),
      1_000,
    );
    return () => clearInterval(timer);
  }, [running]);
  useEffect(
    () => () => {
      void runner.close();
    },
    [runner],
  );
  useInput((input, key) => {
    if (pending && (input.toLowerCase() === 'y' || input.toLowerCase() === 'n')) {
      pending.resolve(input.toLowerCase() === 'y');
      setPending(undefined);
      return;
    }
    if (key.ctrl && input === 'c') {
      if (running) controller.current?.abort();
      else if (picker) setPicker(undefined);
      else if (secretProvider) {
        setSecretProvider(undefined);
        add('info', 'API key entry cancelled.');
      } else exit();
    }
  });

  const command = async (raw: string): Promise<boolean> => {
    const [name, ...args] = raw.slice(1).trim().split(/\s+/);
    const argument = args.join(' ');
    switch (name) {
      case 'help':
        add(
          'info',
          '/auth <provider>  /connect  /model [id]  /provider [id]\n/mode [ask|auto-edit|plan|unrestricted]  /permissions  /mcp\n/context  /compact  /diff  /undo  /redo  /sessions\n/clear  /cost  /exit\nTab completes commands. Shift/Alt+Enter inserts a newline. Ctrl+C cancels or exits.',
        );
        return true;
      case 'auth':
        if (!argument) {
          add(
            'info',
            (await runner.registry.listWithStatus())
              .map(
                (item) =>
                  `${item.id.padEnd(14)} ${item.configured ? 'connected ✓' : 'needs API key'}`,
              )
              .join('\n'),
          );
          return true;
        }
        if (!providerIds.includes(argument))
          throw new Error(`Unknown provider: ${argument}`);
        setSecretProvider(argument);
        add('info', `Enter the ${argument} API key below. It will be hidden.`);
        return true;
      case 'connect': {
        setConnection('testing');
        const result = await runner.testConnection(controller.current?.signal);
        setConnection('online');
        add(
          'info',
          `Connected to ${runner.getProvider()}/${runner.getModel()} in ${result.elapsedMs}ms.`,
        );
        return true;
      }
      case 'model':
        if (argument) {
          await runner.setModel(argument);
          add('info', `Model: ${argument}`);
        } else {
          await openModelPicker();
        }
        return true;
      case 'provider':
        if (argument) {
          await runner.setProvider(argument);
          add('info', `Provider: ${argument}`);
          await openModelPicker();
        } else
          add(
            'info',
            (await runner.registry.listWithStatus())
              .map(
                (item) =>
                  `${item.id.padEnd(14)} ${item.displayName}${item.configured ? ' ✓' : ''}`,
              )
              .join('\n'),
          );
        return true;
      case 'mode':
      case 'permissions':
        if (argument) {
          if (!['ask', 'auto-edit', 'plan', 'unrestricted'].includes(argument))
            throw new Error(`Unknown permission mode: ${argument}`);
          await runner.setMode(argument as PermissionMode);
          add('info', `Permission mode: ${runner.getMode()}`);
        } else
          add(
            'info',
            `Permission mode: ${runner.getMode()}\nAvailable: ask, auto-edit, plan, unrestricted`,
          );
        return true;
      case 'mcp':
        add(
          'info',
          runner.mcp
            .configured()
            .map(
              (item) =>
                `${item.name} ${item.transport} ${item.enabled ? 'enabled' : 'disabled'}`,
            )
            .join('\n') || 'No MCP servers configured.',
        );
        return true;
      case 'context':
        add('info', runner.contextReport());
        return true;
      case 'compact':
        await runner.compact();
        add('info', 'Session compacted.');
        return true;
      case 'diff':
        add('info', runner.tools.sessionDiff() || 'No agent-created changes.');
        return true;
      case 'undo':
        {
          const edit = await runner.tools.journal.undo();
          add('info', `Undid ${edit.file}.`);
        }
        return true;
      case 'redo': {
        const edit = await runner.tools.journal.redo();
        add('info', `Redid ${edit.file}.`);
        return true;
      }
      case 'sessions':
        add(
          'info',
          (await runner.sessions.list(runner.root))
            .map(
              (item) => `${item.id}  ${item.updatedAt}  ${item.provider}/${item.model}`,
            )
            .join('\n'),
        );
        return true;
      case 'clear':
        runner.clear();
        setEntries([]);
        return true;
      case 'cost':
        add('info', runner.costReport());
        return true;
      case 'exit':
        await runner.close();
        exit();
        return true;
      default:
        return false;
    }
  };

  const submit = async (value: string) => {
    if (secretProvider) {
      setRunning(true);
      try {
        const backend = await credentials.set(secretProvider, value.trim());
        add(
          'info',
          backend === 'keychain'
            ? `${secretProvider} key saved in the OS keychain.`
            : `${secretProvider} key saved in a private 0600 file.`,
        );
        setConnection('idle');
        setSecretProvider(undefined);
        void openModelPicker();
      } catch (error) {
        add('error', error instanceof Error ? error.message : String(error));
      } finally {
        setRunning(false);
      }
      return;
    }
    add('user', value);
    setRunning(true);
    startedAt.current = Date.now();
    try {
      if (value.startsWith('/') && (await command(value))) return;
      controller.current = new AbortController();
      setConnection('testing');
      let response = '';
      const responseId = counter.current++;
      setEntries((current) => [
        ...current,
        { id: responseId, role: 'assistant', content: '' },
      ]);
      await runner.run(
        value,
        {
          onText(delta) {
            response += delta;
            setEntries((current) =>
              current.map((entry) =>
                entry.id === responseId ? { ...entry, content: response } : entry,
              ),
            );
          },
          onTool(event) {
            if (event.phase === 'start') add('tool', formatTool(event.tool, event.input));
            else add('tool', `  ✓ ${event.tool} ${event.elapsedMs ?? 0}ms`);
          },
          onFallback(from, to, reason) {
            add('info', `Provider fallback: ${from} → ${to}\n${reason}`);
          },
        },
        controller.current.signal,
      );
      setConnection('online');
    } catch (error) {
      setConnection('error');
      add('error', error instanceof Error ? error.message : String(error));
    } finally {
      setRunning(false);
      controller.current = undefined;
    }
  };

  const visible = useMemo(() => entries.slice(-80), [entries]);
  if (!ready) return <Splash repository={runner.root} />;
  const connectionColor =
    connection === 'online'
      ? 'green'
      : connection === 'error'
        ? 'red'
        : connection === 'testing'
          ? 'yellow'
          : 'gray';
  return (
    <Box flexDirection="column">
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          ◆ OpenCodeKit
        </Text>
        <Box>
          <Text color={connectionColor}>● </Text>
          <Text dimColor>
            {runner.git.branch ?? 'no git'} · {runner.getProvider()}/
            {runner.getModel() || 'select-model'} · {runner.getMode().toUpperCase()}
          </Text>
        </Box>
      </Box>
      <Text dimColor>{runner.root}</Text>
      {picker ? (
        <ModelPicker
          models={picker.models}
          loading={picker.loading}
          errors={picker.errors}
          onSelect={(model) => void selectModel(model)}
          onClose={() => setPicker(undefined)}
        />
      ) : (
        <>
          <Box flexDirection="column" marginY={1}>
            {visible.map((entry) => {
              const color =
                entry.role === 'error'
                  ? 'red'
                  : entry.role === 'tool'
                    ? 'yellow'
                    : entry.role === 'user'
                      ? 'green'
                      : entry.role === 'info'
                        ? 'blue'
                        : undefined;
              return (
                <Box key={entry.id}>
                  <Text {...(color ? { color } : {})}>
                    {entry.role === 'user' ? '> ' : ''}
                    {entry.content}
                  </Text>
                </Box>
              );
            })}
          </Box>
          {pending ? (
            <Box
              borderStyle="double"
              borderColor="yellow"
              paddingX={1}
              flexDirection="column"
            >
              <Text bold>Permission required</Text>
              <Text>{pending.request.description}</Text>
              {pending.request.command ? <Text>{pending.request.command}</Text> : null}
              <Text>Approve? y/N</Text>
            </Box>
          ) : null}
          <PromptInput
            disabled={running || Boolean(pending)}
            secret={Boolean(secretProvider)}
            hint={
              secretProvider
                ? `Paste ${secretProvider} API key`
                : 'Ask anything or type /'
            }
            suggestions={suggest}
            onSubmit={(value) => {
              void submit(value);
            }}
          />
          {running ? (
            <Text dimColor>
              {connection === 'testing' ? 'Testing connection' : 'Working'} · {elapsed}s ·
              Ctrl+C to cancel
            </Text>
          ) : (
            <Text dimColor>
              Tab complete · ↑ history · Shift/Alt+Enter multiline · /help
            </Text>
          )}
        </>
      )}
    </Box>
  );
}
