import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput, useStdout } from 'ink';
import type { AvailableModel } from '../providers/registry.js';

const pageSize = 12;

export function filterModels(models: AvailableModel[], query: string): AvailableModel[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return models;
  return models.filter((model) =>
    `${model.id} ${model.provider}`.toLowerCase().includes(needle),
  );
}

export function ModelPicker({
  models,
  loading,
  errors,
  onSelect,
  onClose,
}: {
  models: AvailableModel[];
  loading: boolean;
  errors: Array<{ provider: string; message: string }>;
  onSelect: (model: AvailableModel) => void;
  onClose: () => void;
}): React.ReactNode {
  const { stdout } = useStdout();
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const matches = useMemo(() => filterModels(models, query), [models, query]);
  const width = Math.max(28, Math.min(stdout.columns - 2, 110));

  useEffect(() => setSelected(0), [query]);
  useEffect(
    () => setSelected((current) => Math.min(current, Math.max(0, matches.length - 1))),
    [matches.length],
  );

  useInput((input, key) => {
    if (key.escape) {
      onClose();
      return;
    }
    if (key.upArrow) {
      setSelected((current) => Math.max(0, current - 1));
      return;
    }
    if (key.downArrow) {
      setSelected((current) => Math.min(matches.length - 1, current + 1));
      return;
    }
    if (key.pageUp) {
      setSelected((current) => Math.max(0, current - pageSize));
      return;
    }
    if (key.pageDown) {
      setSelected((current) => Math.min(matches.length - 1, current + pageSize));
      return;
    }
    if (key.return && matches[selected]) {
      onSelect(matches[selected]);
      return;
    }
    if (key.backspace || key.delete) {
      setQuery((current) => current.slice(0, -1));
      return;
    }
    if (key.ctrl && input === 'u') {
      setQuery('');
      return;
    }
    if (!key.ctrl && !key.meta && input) setQuery((current) => current + input);
  });

  const start = Math.max(
    0,
    Math.min(selected - Math.floor(pageSize / 2), matches.length - pageSize),
  );
  const visible = matches.slice(start, start + pageSize);
  return (
    <Box
      width={width}
      borderStyle="double"
      borderColor="cyan"
      paddingX={1}
      flexDirection="column"
      marginY={1}
    >
      <Box justifyContent="space-between">
        <Text bold color="cyan">
          Select a model
        </Text>
        <Text dimColor>{loading ? 'discovering…' : `${matches.length} models`}</Text>
      </Box>
      <Box marginY={1} borderStyle="round" borderColor="gray" paddingX={1}>
        <Text color="cyan">/ </Text>
        <Text>{query}</Text>
        <Text inverse> </Text>
        {!query ? <Text dimColor> Search model or provider</Text> : null}
      </Box>
      <Box paddingX={1} justifyContent="space-between">
        <Text dimColor>MODEL</Text>
        <Text dimColor>PROVIDER</Text>
      </Box>
      {visible.map((model, index) => {
        const active = start + index === selected;
        return (
          <Box key={`${model.provider}/${model.id}`} paddingX={1}>
            <Box flexGrow={1}>
              <Text
                color={active ? 'black' : undefined}
                backgroundColor={active ? 'cyan' : undefined}
                wrap="truncate-end"
              >
                {active ? '› ' : '  '}
                {model.id}
              </Text>
            </Box>
            <Box width={16} justifyContent="flex-end">
              <Text color={active ? 'cyan' : 'magenta'} wrap="truncate-end">
                {model.provider}
              </Text>
            </Box>
          </Box>
        );
      })}
      {!loading && !matches.length ? (
        <Box paddingX={1} marginY={1} flexDirection="column">
          <Text color="yellow">No matching models found.</Text>
          <Text dimColor>Connect a provider with /auth, or configure its models.</Text>
        </Box>
      ) : null}
      {errors.length ? (
        <Text color="yellow" wrap="truncate-end">
          Could not query: {errors.map((error) => error.provider).join(', ')}
        </Text>
      ) : null}
      <Text dimColor>↑↓ navigate · PgUp/PgDn jump · Enter select · Esc close</Text>
    </Box>
  );
}
