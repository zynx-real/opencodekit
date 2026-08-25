export interface CommandSuggestion {
  value: string;
  label: string;
  description: string;
}

const commands: CommandSuggestion[] = [
  { value: '/help', label: '/help', description: 'Show keyboard and command help' },
  {
    value: '/auth ',
    label: '/auth <provider>',
    description: 'Enter or replace an API key',
  },
  {
    value: '/connect',
    label: '/connect',
    description: 'Test the active provider and model',
  },
  { value: '/provider ', label: '/provider <id>', description: 'Switch AI provider' },
  { value: '/model ', label: '/model <id>', description: 'List or switch models' },
  { value: '/mode ', label: '/mode <mode>', description: 'Change permission mode' },
  { value: '/permissions', label: '/permissions', description: 'Show permission policy' },
  { value: '/mcp', label: '/mcp', description: 'Show MCP connections' },
  { value: '/context', label: '/context', description: 'Show context usage' },
  { value: '/compact', label: '/compact', description: 'Compact conversation history' },
  { value: '/diff', label: '/diff', description: 'Show this session’s changes' },
  { value: '/undo', label: '/undo', description: 'Undo the last agent edit' },
  { value: '/redo', label: '/redo', description: 'Redo the last undone edit' },
  { value: '/sessions', label: '/sessions', description: 'List repository sessions' },
  { value: '/cost', label: '/cost', description: 'Show token and cost usage' },
  { value: '/clear', label: '/clear', description: 'Clear visible conversation' },
  { value: '/exit', label: '/exit', description: 'Close OpenCodeKit' },
];

export interface SuggestionContext {
  providers: string[];
  models?: string[];
}

function argumentSuggestions(
  prefix: string,
  values: string[],
  description: string,
): CommandSuggestion[] {
  const [command, partial = ''] = prefix.split(/\s+/, 2);
  return values
    .filter((value) => value.toLowerCase().startsWith(partial.toLowerCase()))
    .slice(0, 6)
    .map((value) => ({
      value: `${command} ${value}`,
      label: value,
      description,
    }));
}

export function commandSuggestions(
  value: string,
  context: SuggestionContext,
): CommandSuggestion[] {
  if (!value.startsWith('/')) return [];
  if (value.startsWith('/provider '))
    return argumentSuggestions(value, context.providers, 'Switch provider');
  if (value.startsWith('/auth '))
    return argumentSuggestions(value, context.providers, 'Store API key');
  if (value.startsWith('/mode '))
    return argumentSuggestions(
      value,
      ['ask', 'auto-edit', 'plan', 'unrestricted'],
      'Permission mode',
    );
  if (value.startsWith('/model ') && context.models)
    return argumentSuggestions(value, context.models, 'Switch model');
  if (value.includes(' ')) return [];
  return commands
    .filter((command) => command.value.startsWith(value.toLowerCase()))
    .slice(0, 7);
}

export const slashCommands = commands;
