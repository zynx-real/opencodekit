import { createAmazonBedrock } from '@ai-sdk/amazon-bedrock';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
import { createCerebras } from '@ai-sdk/cerebras';
import { createCohere } from '@ai-sdk/cohere';
import { createDeepInfra } from '@ai-sdk/deepinfra';
import { createFireworks } from '@ai-sdk/fireworks';
import { createGoogle } from '@ai-sdk/google';
import { createGroq } from '@ai-sdk/groq';
import { createMistral } from '@ai-sdk/mistral';
import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createPerplexity } from '@ai-sdk/perplexity';
import { createTogetherAI } from '@ai-sdk/togetherai';
import { createXai } from '@ai-sdk/xai';
import type { LanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import type { LanguageModelV4StreamPart, LanguageModelV4Usage } from '@ai-sdk/provider';
import type { AppConfig, ProviderConfig } from '../config/schema.js';
import { CredentialStore } from '../auth/store.js';
import { providerError } from './errors.js';

export interface ProviderCapabilities {
  text: boolean;
  streaming: boolean;
  toolCalling: 'model-dependent' | boolean;
  reasoning: 'model-dependent' | boolean;
  images: 'model-dependent' | boolean;
  structuredOutput: 'model-dependent' | boolean;
}

export interface ProviderInfo {
  id: string;
  displayName: string;
  env?: string;
  configured: boolean;
  capabilities: ProviderCapabilities;
}

export interface AvailableModel {
  provider: string;
  id: string;
}

export interface ModelDiscoveryResult {
  models: AvailableModel[];
  errors: Array<{ provider: string; message: string }>;
}

interface Definition {
  displayName: string;
  env?: string;
  defaultBaseURL?: string;
  official: boolean;
}

const definitions: Record<string, Definition> = {
  openai: { displayName: 'OpenAI', env: 'OPENAI_API_KEY', official: true },
  anthropic: { displayName: 'Anthropic', env: 'ANTHROPIC_API_KEY', official: true },
  google: {
    displayName: 'Google Generative AI',
    env: 'GOOGLE_GENERATIVE_AI_API_KEY',
    official: true,
  },
  xai: { displayName: 'xAI', env: 'XAI_API_KEY', official: true },
  openrouter: {
    displayName: 'OpenRouter',
    env: 'OPENROUTER_API_KEY',
    defaultBaseURL: 'https://openrouter.ai/api/v1',
    official: false,
  },
  azure: { displayName: 'Azure OpenAI', env: 'AZURE_API_KEY', official: true },
  bedrock: { displayName: 'Amazon Bedrock', env: 'AWS_ACCESS_KEY_ID', official: true },
  groq: { displayName: 'Groq', env: 'GROQ_API_KEY', official: true },
  mistral: { displayName: 'Mistral', env: 'MISTRAL_API_KEY', official: true },
  deepseek: {
    displayName: 'DeepSeek',
    env: 'DEEPSEEK_API_KEY',
    defaultBaseURL: 'https://api.deepseek.com',
    official: false,
  },
  together: { displayName: 'Together.ai', env: 'TOGETHER_AI_API_KEY', official: true },
  fireworks: { displayName: 'Fireworks', env: 'FIREWORKS_API_KEY', official: true },
  cerebras: { displayName: 'Cerebras', env: 'CEREBRAS_API_KEY', official: true },
  cohere: { displayName: 'Cohere', env: 'COHERE_API_KEY', official: true },
  deepinfra: { displayName: 'DeepInfra', env: 'DEEPINFRA_API_KEY', official: true },
  perplexity: { displayName: 'Perplexity', env: 'PERPLEXITY_API_KEY', official: true },
  local: {
    displayName: 'Local / OpenAI-compatible',
    defaultBaseURL: 'http://localhost:1234/v1',
    official: false,
  },
  ollama: {
    displayName: 'Ollama / OpenAI-compatible',
    defaultBaseURL: 'http://localhost:11434/v1',
    official: false,
  },
  mock: { displayName: 'Offline verification provider', official: false },
};

const capabilities: ProviderCapabilities = {
  text: true,
  streaming: true,
  toolCalling: 'model-dependent',
  reasoning: 'model-dependent',
  images: 'model-dependent',
  structuredOutput: 'model-dependent',
};

const modelEndpoints: Record<string, string> = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  google: 'https://generativelanguage.googleapis.com/v1beta',
  xai: 'https://api.x.ai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  deepseek: 'https://api.deepseek.com',
  together: 'https://api.together.xyz/v1',
  fireworks: 'https://api.fireworks.ai/inference/v1',
  cerebras: 'https://api.cerebras.ai/v1',
  cohere: 'https://api.cohere.com/v1',
  deepinfra: 'https://api.deepinfra.com/v1/openai',
};

function modelIds(body: unknown): string[] {
  const root = body as {
    data?: Array<string | { id?: string; name?: string }>;
    models?: Array<string | { id?: string; name?: string }>;
  };
  const rows = Array.isArray(body)
    ? (body as Array<string | { id?: string; name?: string }>)
    : [...(root.data ?? []), ...(root.models ?? [])];
  return [
    ...new Set(
      rows.flatMap((item) => {
        const id = typeof item === 'string' ? item : (item.id ?? item.name);
        return id ? [id.replace(/^models\//, '')] : [];
      }),
    ),
  ].sort((left, right) => left.localeCompare(right));
}

async function gatewayModels(provider: string): Promise<string[]> {
  const response = await fetch('https://ai-gateway.vercel.sh/v1/models', {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`Public model catalog failed (${response.status}).`);
  const body = (await response.json()) as { data?: Array<{ id?: string }> };
  return (body.data ?? [])
    .flatMap((item) => {
      const prefix = `${provider}/`;
      return item.id?.startsWith(prefix) ? [item.id.slice(prefix.length)] : [];
    })
    .sort((left, right) => left.localeCompare(right));
}

function usage(): LanguageModelV4Usage {
  return {
    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 4, text: 4, reasoning: 0 },
  };
}

function mockModel(modelId: string): LanguageModel {
  const text = 'Hello from OpenCodeKit’s offline verification provider.';
  return new MockLanguageModelV4({
    provider: 'opencodekit.mock',
    modelId,
    doGenerate: {
      content: [{ type: 'text', text }],
      finishReason: { unified: 'stop', raw: 'stop' },
      usage: usage(),
      warnings: [],
    },
    doStream: {
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          controller.enqueue({ type: 'stream-start', warnings: [] });
          controller.enqueue({ type: 'text-start', id: 'mock-text' });
          controller.enqueue({ type: 'text-delta', id: 'mock-text', delta: text });
          controller.enqueue({ type: 'text-end', id: 'mock-text' });
          controller.enqueue({
            type: 'finish',
            finishReason: { unified: 'stop', raw: 'stop' },
            usage: usage(),
          });
          controller.close();
        },
      }),
    },
  });
}

export class ProviderRegistry {
  private readonly credentials = new CredentialStore();

  constructor(private readonly config: AppConfig) {}

  list(): ProviderInfo[] {
    const ids = new Set([
      ...Object.keys(definitions),
      ...Object.keys(this.config.providers),
    ]);
    return [...ids].sort().map((id) => {
      const definition = definitions[id];
      const custom = this.config.providers[id];
      const env = custom?.apiKeyEnv ?? definition?.env;
      return {
        id,
        displayName: definition?.displayName ?? id,
        ...(env ? { env } : {}),
        configured:
          id === 'mock' ||
          id === 'local' ||
          id === 'ollama' ||
          Boolean(custom?.baseURL || (env && process.env[env])),
        capabilities,
      };
    });
  }

  async listWithStatus(): Promise<ProviderInfo[]> {
    const providers = this.list();
    return await Promise.all(
      providers.map(async (provider) => ({
        ...provider,
        configured: provider.configured || Boolean(await this.credential(provider.id)),
      })),
    );
  }

  getCredentialEnvironment(provider: string): string | undefined {
    return this.config.providers[provider]?.apiKeyEnv ?? definitions[provider]?.env;
  }

  async credential(provider: string): Promise<string | undefined> {
    const env = this.getCredentialEnvironment(provider);
    return (env ? process.env[env] : undefined) ?? (await this.credentials.get(provider));
  }

  private settings(provider: string): ProviderConfig {
    const configured = this.config.providers[provider];
    const definition = definitions[provider];
    return {
      type: configured?.type ?? 'builtin',
      baseURL: configured?.baseURL ?? definition?.defaultBaseURL,
      apiKeyEnv: configured?.apiKeyEnv,
      headers: configured?.headers ?? {},
      models: configured?.models ?? [],
      resourceName: configured?.resourceName,
      region: configured?.region,
    };
  }

  async createModel(provider: string, modelId: string): Promise<LanguageModel> {
    if (provider === 'mock') return mockModel(modelId);
    const settings = this.settings(provider);
    const apiKey = await this.credential(provider);
    if (
      provider !== 'bedrock' &&
      provider !== 'local' &&
      provider !== 'ollama' &&
      !apiKey
    ) {
      const env = this.getCredentialEnvironment(provider);
      throw new Error(
        `${definitions[provider]?.displayName ?? provider} authentication failed.\n\nNo credential was found.\nRun /auth ${provider} inside OpenCodeKit or opencodekit auth login ${provider}.${env ? `\nEnvironment alternative: ${env}` : ''}`,
      );
    }
    const common = {
      ...(apiKey ? { apiKey } : {}),
      ...(settings.baseURL ? { baseURL: settings.baseURL } : {}),
    };
    switch (provider) {
      case 'openai':
        return createOpenAI(common)(modelId);
      case 'anthropic':
        return createAnthropic(common)(modelId);
      case 'google':
        return createGoogle(common)(modelId);
      case 'xai':
        return createXai(common)(modelId);
      case 'azure':
        return createAzure({
          ...common,
          ...(settings.resourceName ? { resourceName: settings.resourceName } : {}),
        })(modelId);
      case 'bedrock':
        return createAmazonBedrock({
          ...(settings.region ? { region: settings.region } : {}),
        })(modelId);
      case 'groq':
        return createGroq(common)(modelId);
      case 'mistral':
        return createMistral(common)(modelId);
      case 'together':
        return createTogetherAI(common)(modelId);
      case 'fireworks':
        return createFireworks(common)(modelId);
      case 'cerebras':
        return createCerebras(common)(modelId);
      case 'cohere':
        return createCohere(common)(modelId);
      case 'deepinfra':
        return createDeepInfra(common)(modelId);
      case 'perplexity':
        return createPerplexity(common)(modelId);
      default: {
        if (!settings.baseURL)
          throw new Error(
            `Provider ${provider} needs providers.${provider}.baseURL in config.`,
          );
        return createOpenAICompatible({
          name: provider,
          baseURL: settings.baseURL,
          ...(apiKey ? { apiKey } : {}),
          headers: settings.headers,
        })(modelId);
      }
    }
  }

  async listModels(provider: string): Promise<string[]> {
    const settings = this.settings(provider);
    if (provider === 'mock') return ['mock'];
    if (settings.models.length > 0) return settings.models;
    const definition = definitions[provider];
    if (provider === 'perplexity') return await gatewayModels(provider);
    if (provider === 'azure' || provider === 'bedrock') return [];
    const baseURL = settings.baseURL ?? modelEndpoints[provider];
    if (!baseURL) return [];
    const apiKey = await this.credential(provider);
    if (definition?.env && !apiKey)
      throw new Error(
        `${definition.displayName} model discovery needs a credential. Run /auth ${provider}.`,
      );
    const url = new URL(`${baseURL.replace(/\/$/, '')}/models`);
    if (provider === 'google' && apiKey) url.searchParams.set('key', apiKey);
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          ...(apiKey && provider !== 'google'
            ? provider === 'anthropic'
              ? { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
              : { Authorization: `Bearer ${apiKey}` }
            : {}),
          ...settings.headers,
        },
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      throw providerError(error, {
        provider,
        credentialEnv: this.getCredentialEnvironment(provider),
      });
    }
    if (!response.ok) {
      const hint =
        response.status === 401
          ? ` Run /auth ${provider} to replace the API key.`
          : response.status === 404
            ? ' Check the provider base URL.'
            : '';
      throw new Error(
        `${definition?.displayName ?? provider} model discovery failed (${response.status}).${hint}`,
      );
    }
    return modelIds(await response.json());
  }

  async listAvailableModels(
    currentProvider?: string,
    currentModel?: string,
  ): Promise<ModelDiscoveryResult> {
    const explicit = new Set(Object.keys(this.config.providers));
    const providers = (await this.listWithStatus())
      .filter(
        (item) =>
          item.configured &&
          (item.id === currentProvider ||
            (item.id !== 'mock' && item.id !== 'local' && item.id !== 'ollama') ||
            explicit.has(item.id)),
      )
      .map((item) => item.id);
    if (currentProvider && !providers.includes(currentProvider))
      providers.push(currentProvider);

    const models: AvailableModel[] = [];
    const errors: ModelDiscoveryResult['errors'] = [];
    await Promise.all(
      providers.map(async (provider) => {
        try {
          for (const id of await this.listModels(provider)) models.push({ provider, id });
        } catch (error) {
          errors.push({
            provider,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }),
    );
    if (
      currentProvider &&
      currentModel &&
      !models.some(
        (model) => model.provider === currentProvider && model.id === currentModel,
      )
    )
      models.push({ provider: currentProvider, id: currentModel });
    models.sort(
      (left, right) =>
        left.provider.localeCompare(right.provider) || left.id.localeCompare(right.id),
    );
    return { models, errors };
  }
}

export const supportedProviderIds = Object.keys(definitions);
