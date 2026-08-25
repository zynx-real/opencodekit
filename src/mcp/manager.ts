import { createMCPClient, type MCPClient } from '@ai-sdk/mcp';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { ToolSet } from 'ai';
import type { AppConfig } from '../config/schema.js';

export interface MCPConnection {
  name: string;
  tools: string[];
  server: string;
  version: string;
}

export class MCPManager {
  private readonly clients: MCPClient[] = [];

  constructor(private readonly config: AppConfig) {}

  configured(): Array<{ name: string; transport: string; enabled: boolean }> {
    return Object.entries(this.config.mcp).map(([name, server]) => ({
      name,
      transport: server.transport,
      enabled: server.enabled,
    }));
  }

  async connectAll(): Promise<{ tools: ToolSet; connections: MCPConnection[] }> {
    const tools: ToolSet = {};
    const connections: MCPConnection[] = [];
    for (const [name, server] of Object.entries(this.config.mcp)) {
      if (!server.enabled) continue;
      const transport =
        server.transport === 'stdio'
          ? new StdioClientTransport({
              command: server.command,
              args: server.args,
              env: { ...process.env, ...server.env } as Record<string, string>,
            })
          : {
              type: 'http' as const,
              url: server.url,
              headers: server.headers,
              redirect: 'error' as const,
            };
      const client = await createMCPClient({ transport, maxRetries: 1 });
      this.clients.push(client);
      const remoteTools = await client.tools();
      const names: string[] = [];
      for (const [toolName, remoteTool] of Object.entries(remoteTools)) {
        const namespaced = `${name}__${toolName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
        if (namespaced in tools)
          throw new Error(`MCP tool namespace collision: ${namespaced}`);
        tools[namespaced] = remoteTool;
        names.push(namespaced);
      }
      connections.push({
        name,
        tools: names,
        server: client.serverInfo.name,
        version: client.serverInfo.version,
      });
    }
    return { tools, connections };
  }

  async close(): Promise<void> {
    await Promise.allSettled(this.clients.map(async (client) => await client.close()));
    this.clients.length = 0;
  }
}
