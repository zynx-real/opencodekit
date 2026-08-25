import { afterEach, describe, expect, it, vi } from 'vitest';
import { debug } from '../src/utils/logger.js';

describe('debug logger', () => {
  afterEach(() => {
    delete process.env.OPENCODEKIT_LOG;
    vi.restoreAllMocks();
  });

  it('redacts credentials while retaining usage counts', () => {
    process.env.OPENCODEKIT_LOG = 'debug';
    const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    debug('provider.test', { apiKey: 'secret-value', inputTokens: 42 });
    const line = String(write.mock.calls[0]?.[0]);
    expect(line).not.toContain('secret-value');
    expect(line).toContain('"apiKey":"[redacted]"');
    expect(line).toContain('"inputTokens":42');
  });
});
