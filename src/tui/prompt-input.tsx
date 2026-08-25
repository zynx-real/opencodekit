import React, { useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { CommandSuggestion } from './commands.js';

export function PromptInput({
  disabled,
  secret = false,
  hint,
  suggestions,
  onSubmit,
}: {
  disabled: boolean;
  secret?: boolean;
  hint: string;
  suggestions: (value: string) => CommandSuggestion[];
  onSubmit: (value: string) => void;
}): React.ReactNode {
  const [value, setValue] = useState('');
  const [cursor, setCursor] = useState(0);
  const [history, setHistory] = useState<string[]>([]);
  const [, setHistoryIndex] = useState(-1);
  const matches = useMemo(
    () => (secret ? [] : suggestions(value)),
    [secret, suggestions, value],
  );

  const replace = (next: string) => {
    setValue(next);
    setCursor(next.length);
  };

  useInput((input, key) => {
    if (disabled) return;
    if ((key.tab || input === '\t') && matches[0]) {
      replace(matches[0].value);
      return;
    }
    if (key.return) {
      if (key.shift || key.meta) {
        const next = `${value.slice(0, cursor)}\n${value.slice(cursor)}`;
        setValue(next);
        setCursor(cursor + 1);
        return;
      }
      if (value.trim()) {
        const submitted = value;
        if (!secret) setHistory((current) => [...current, submitted]);
        setHistoryIndex(-1);
        replace('');
        onSubmit(submitted);
      }
      return;
    }
    if (key.leftArrow) {
      setCursor((current) => Math.max(0, current - 1));
      return;
    }
    if (key.rightArrow) {
      setCursor((current) => Math.min(value.length, current + 1));
      return;
    }
    if (key.home || (key.ctrl && input === 'a')) {
      setCursor(0);
      return;
    }
    if (key.end || (key.ctrl && input === 'e')) {
      setCursor(value.length);
      return;
    }
    if (key.ctrl && input === 'u') {
      replace('');
      return;
    }
    if (key.backspace) {
      if (cursor > 0) {
        setValue(`${value.slice(0, cursor - 1)}${value.slice(cursor)}`);
        setCursor(cursor - 1);
      }
      return;
    }
    if (key.delete) {
      if (cursor < value.length)
        setValue(`${value.slice(0, cursor)}${value.slice(cursor + 1)}`);
      return;
    }
    if (key.upArrow && !secret) {
      setHistoryIndex((current) => {
        const next = Math.min(history.length - 1, current + 1);
        if (next >= 0) replace(history[history.length - 1 - next] ?? '');
        return next;
      });
      return;
    }
    if (key.downArrow && !secret) {
      setHistoryIndex((current) => {
        const next = Math.max(-1, current - 1);
        replace(next < 0 ? '' : (history[history.length - 1 - next] ?? ''));
        return next;
      });
      return;
    }
    if (!key.ctrl && !key.meta && input) {
      setValue(`${value.slice(0, cursor)}${input}${value.slice(cursor)}`);
      setCursor(cursor + input.length);
    }
  });

  const display = secret ? '•'.repeat(value.length) : value;
  const before = display.slice(0, cursor);
  const atCursor = display[cursor] ?? ' ';
  const after = display.slice(cursor + (cursor < display.length ? 1 : 0));

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="round"
        borderColor={secret ? 'magenta' : disabled ? 'gray' : 'cyan'}
        paddingX={1}
      >
        <Text color={secret ? 'magenta' : 'cyan'}>{secret ? '◆ ' : '› '}</Text>
        {value ? (
          <Text>
            {before}
            <Text inverse>{atCursor}</Text>
            {after}
          </Text>
        ) : (
          <Text dimColor>{disabled ? 'Working…' : hint}</Text>
        )}
      </Box>
      {!disabled && matches.length ? (
        <Box flexDirection="column" paddingX={2}>
          {matches.map((match, index) => (
            <Text key={`${match.value}-${match.description}`} dimColor={index !== 0}>
              {index === 0 ? '↳ ' : '  '}
              <Text color={index === 0 ? 'cyan' : undefined}>{match.label}</Text>
              <Text dimColor> {match.description}</Text>
              {index === 0 ? <Text color="magenta"> Tab</Text> : null}
            </Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
