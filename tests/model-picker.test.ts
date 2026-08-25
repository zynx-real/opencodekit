import { describe, expect, it } from 'vitest';
import { filterModels } from '../src/tui/model-picker.js';

const models = [
  { provider: 'anthropic', id: 'claude-sonnet' },
  { provider: 'openai', id: 'gpt-coder' },
  { provider: 'google', id: 'gemini-pro' },
];

describe('model picker', () => {
  it('searches model IDs and provider names', () => {
    expect(filterModels(models, 'coder')).toEqual([models[1]]);
    expect(filterModels(models, 'ANTHROPIC')).toEqual([models[0]]);
  });

  it('shows every model for an empty query', () => {
    expect(filterModels(models, '')).toEqual(models);
  });
});
