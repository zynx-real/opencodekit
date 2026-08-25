import { APICallError, LoadAPIKeyError, RetryError } from 'ai';

function unwrap(error: unknown): unknown {
  if (RetryError.isInstance(error)) return unwrap(error.lastError);
  return error;
}

export function providerError(
  error: unknown,
  context: { provider: string; model?: string; credentialEnv?: string },
): Error {
  const actual = unwrap(error);
  const provider = context.provider;
  const model = context.model ? `/${context.model}` : '';
  const authHint = `Run /auth ${provider} or opencodekit auth login ${provider}${context.credentialEnv ? ` (environment: ${context.credentialEnv})` : ''}.`;

  if (LoadAPIKeyError.isInstance(actual)) {
    return new Error(`${provider}${model} has no usable API key.\n${authHint}`, {
      cause: error,
    });
  }
  if (APICallError.isInstance(actual)) {
    const status = actual.statusCode;
    if (status === 401)
      return new Error(
        `${provider}${model} rejected the API key (401).\nReplace it with ${authHint}`,
        { cause: error },
      );
    if (status === 403)
      return new Error(
        `${provider}${model} authenticated, but this account cannot access the requested model (403).`,
        { cause: error },
      );
    if (status === 404)
      return new Error(
        `${provider}${model} was not found (404). Check the model ID and provider base URL.`,
        { cause: error },
      );
    if (status === 429)
      return new Error(
        `${provider}${model} is rate limited (429). Wait briefly or switch provider/model with /provider and /model.`,
        { cause: error },
      );
    if (status && status >= 500)
      return new Error(
        `${provider}${model} is temporarily unavailable (${status}) after retries.`,
        { cause: error },
      );
    return new Error(
      `${provider}${model} connection failed${status ? ` (${status})` : ''}: ${actual.message}`,
      { cause: error },
    );
  }
  const message = actual instanceof Error ? actual.message : String(actual);
  if (/ECONNREFUSED|fetch failed/i.test(message))
    return new Error(
      `Could not connect to ${provider}${model}. Check your network or local provider base URL.\n${message}`,
      { cause: error },
    );
  if (/certificate|TLS|SSL/i.test(message))
    return new Error(
      `Secure connection to ${provider}${model} failed. Check the endpoint certificate and system clock.\n${message}`,
      { cause: error },
    );
  return actual instanceof Error ? actual : new Error(message);
}
