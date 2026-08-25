import { z } from 'zod';

export const permissionModeSchema = z.enum(['ask', 'auto-edit', 'plan', 'unrestricted']);

export const providerConfigSchema = z.object({
  type: z.string().default('builtin'),
  baseURL: z.url().optional(),
  apiKeyEnv: z.string().optional(),
  headers: z.record(z.string(), z.string()).default({}),
  models: z.array(z.string()).default([]),
  resourceName: z.string().optional(),
  region: z.string().optional(),
});

export const mcpServerSchema = z.discriminatedUnion('transport', [
  z.object({
    transport: z.literal('stdio'),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    env: z.record(z.string(), z.string()).default({}),
    enabled: z.boolean().default(true),
  }),
  z.object({
    transport: z.literal('http'),
    url: z.url(),
    headers: z.record(z.string(), z.string()).default({}),
    enabled: z.boolean().default(true),
  }),
]);

export const configSchema = z.object({
  provider: z.string().default('openai'),
  model: z.string().optional(),
  fallback: z.array(z.string()).default([]),
  providers: z.record(z.string(), providerConfigSchema).default({}),
  permissions: z
    .object({
      mode: permissionModeSchema.default('ask'),
      bash: z.object({ allow: z.array(z.string()).default([]) }).default({ allow: [] }),
    })
    .default({ mode: 'ask', bash: { allow: [] } }),
  agent: z
    .object({
      maxTurns: z.number().int().min(1).max(200).default(50),
      maxContextTokens: z.number().int().min(1_000).default(120_000),
    })
    .default({ maxTurns: 50, maxContextTokens: 120_000 }),
  mcp: z.record(z.string(), mcpServerSchema).default({}),
});

export type AppConfig = z.infer<typeof configSchema>;
export type ProviderConfig = z.infer<typeof providerConfigSchema>;
export type MCPServerConfig = z.infer<typeof mcpServerSchema>;
export type PermissionMode = z.infer<typeof permissionModeSchema>;
