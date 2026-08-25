import { describe, expect, it } from 'vitest';
import { commandSuggestions } from '../src/tui/commands.js';
import { logoLines } from '../src/tui/logo.js';

const context = {
  providers: ['openai', 'openrouter', 'anthropic'],
  models: ['alpha', 'beta'],
};

describe('terminal UI helpers', () => {
  it('renders a branded ASCII splash', () => {
    expect(logoLines.join('\n')).toContain('T E R M I N A L');
    expect(logoLines.length).toBeGreaterThan(4);
  });

  it('completes slash commands immediately', () => {
    expect(commandSuggestions('/au', context)[0]).toMatchObject({
      value: '/auth ',
    });
    expect(commandSuggestions('/con', context)[0]).toMatchObject({
      value: '/connect',
    });
  });

  it('suggests providers, models, and permission modes', () => {
    expect(commandSuggestions('/provider openr', context)[0]?.value).toBe(
      '/provider openrouter',
    );
    expect(commandSuggestions('/model b', context)[0]?.value).toBe('/model beta');
    expect(commandSuggestions('/mode a', context).map((item) => item.value)).toEqual([
      '/mode ask',
      '/mode auto-edit',
    ]);
  });

  it('does not suggest commands for normal prompts', () => {
    expect(commandSuggestions('fix the tests', context)).toEqual([]);
  });
});
