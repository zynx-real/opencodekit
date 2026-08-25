import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { configSchema } from '../src/config/schema.js';
import { MCPManager } from '../src/mcp/manager.js';

describe('MCPManager', () => {
  it('connects stdio servers and namespaces tools', async () => {
    const fixture = path.join(
      path.dirname(fileURLToPath(import.meta.url)),
      'fixtures',
      'mcp-server.mjs',
    );
    const config = configSchema.parse({
      mcp: { test: { transport: 'stdio', command: process.execPath, args: [fixture] } },
    });
    const manager = new MCPManager(config);
    try {
      const result = await manager.connectAll();
      expect(result.connections[0]).toMatchObject({
        name: 'test',
        server: 'opencodekit-test',
      });
      expect(Object.keys(result.tools)).toEqual(['test__echo']);
    } finally {
      await manager.close();
    }
  });

  it('rejects namespace collisions after sanitization', async () => {
    const manager = new MCPManager(configSchema.parse({}));
    expect((await manager.connectAll()).tools).toEqual({});
    await manager.close();
  });
});
