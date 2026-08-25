import { APICallError } from 'ai';
import { describe, expect, it } from 'vitest';
import { providerError } from '../src/providers/errors.js';

function apiError(statusCode: number): APICallError {
  return new APICallError({
    message: 'request failed',
    url: 'https://example.test/v1',
    requestBodyValues: {},
    statusCode,
  });
}

describe('providerError', () => {
  it('turns authentication failures into actionable guidance', () => {
    expect(
      providerError(apiError(401), {
        provider: 'openai',
        model: 'model',
        credentialEnv: 'OPENAI_API_KEY',
      }).message,
    ).toContain('/auth openai');
  });

  it('distinguishes missing models, rate limits, and outages', () => {
    expect(providerError(apiError(404), { provider: 'test' }).message).toContain(
      'model ID',
    );
    expect(providerError(apiError(429), { provider: 'test' }).message).toContain(
      'rate limited',
    );
    expect(providerError(apiError(503), { provider: 'test' }).message).toContain(
      'temporarily unavailable',
    );
  });
});
