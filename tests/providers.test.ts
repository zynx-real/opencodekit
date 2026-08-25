import { describe, expect, it, vi } from 'vitest';
import { configSchema } from '../src/config/schema.js';
import { ProviderRegistry } from '../src/providers/registry.js';

describe('ProviderRegistry', () => {
  it('registers all first-class providers', () => {
    const ids = new ProviderRegistry(configSchema.parse({}))
      .list()
      .map((item) => item.id);
    expect(ids).toEqual(
      expect.arrayContaining([
        'openai',
        'anthropic',
        'google',
        'xai',
        'openrouter',
        'azure',
        'bedrock',
        'groq',
        'mistral',
        'deepseek',
        'together',
        'fireworks',
        'cerebras',
        'cohere',
        'deepinfra',
        'perplexity',
        'local',
        'ollama',
      ]),
    );
  });

  it('reports missing credentials clearly', async () => {
    const registry = new ProviderRegistry(configSchema.parse({}));
    const previous = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    await expect(registry.createModel('openai', 'test')).rejects.toThrow(
      'OPENAI_API_KEY',
    );
    if (previous) process.env.OPENAI_API_KEY = previous;
  });

  it('creates arbitrary OpenAI-compatible models with custom URLs', async () => {
    const registry = new ProviderRegistry(
      configSchema.parse({
        providers: {
          custom: {
            type: 'openai-compatible',
            baseURL: 'http://127.0.0.1:9999/v1',
            apiKeyEnv: 'CUSTOM_KEY',
          },
        },
      }),
    );
    process.env.CUSTOM_KEY = 'test-key';
    const model = await registry.createModel('custom', 'my-model');
    expect(typeof model).toBe('object');
    expect((model as { modelId: string }).modelId).toBe('my-model');
    delete process.env.CUSTOM_KEY;
  });

  it('provides an explicit offline verification provider', async () => {
    const model = await new ProviderRegistry(configSchema.parse({})).createModel(
      'mock',
      'mock',
    );
    expect((model as { provider: string }).provider).toBe('opencodekit.mock');
  });

  it('discovers models using provider-specific authentication', async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'anthropic-test-key';
    const request = vi.fn<
      (url: string | URL, options?: RequestInit) => Promise<Response>
    >(
      async () =>
        new Response(
          JSON.stringify({ data: [{ id: 'claude-current' }, { id: 'claude-fast' }] }),
          { status: 200 },
        ),
    );
    vi.stubGlobal('fetch', request);
    try {
      const models = await new ProviderRegistry(configSchema.parse({})).listModels(
        'anthropic',
      );
      expect(models).toEqual(['claude-current', 'claude-fast']);
      const [url, options] = request.mock.calls[0] ?? [];
      expect(String(url)).toBe('https://api.anthropic.com/v1/models');
      expect(options?.headers).toMatchObject({
        'x-api-key': 'anthropic-test-key',
        'anthropic-version': '2023-06-01',
      });
    } finally {
      vi.unstubAllGlobals();
      if (previous) process.env.ANTHROPIC_API_KEY = previous;
      else delete process.env.ANTHROPIC_API_KEY;
    }
  });

  it('normalizes Google model resource names', async () => {
    const previous = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    process.env.GOOGLE_GENERATIVE_AI_API_KEY = 'google-test-key';
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ models: [{ name: 'models/gemini-current' }] })),
      ),
    );
    try {
      await expect(
        new ProviderRegistry(configSchema.parse({})).listModels('google'),
      ).resolves.toEqual(['gemini-current']);
    } finally {
      vi.unstubAllGlobals();
      if (previous) process.env.GOOGLE_GENERATIVE_AI_API_KEY = previous;
      else delete process.env.GOOGLE_GENERATIVE_AI_API_KEY;
    }
  });
});
