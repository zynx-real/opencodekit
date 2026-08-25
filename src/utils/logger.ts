const secretPattern =
  /(api[-_]?key|authorization|credential|secret|(^|[-_])(access|refresh)?[-_]?token$)/i;

function redact(value: unknown, key = ''): unknown {
  if (secretPattern.test(key)) return '[redacted]';
  if (Array.isArray(value)) return value.map((item) => redact(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([childKey, child]) => [
        childKey,
        redact(child, childKey),
      ]),
    );
  }
  return value;
}

export function debug(event: string, data: Record<string, unknown> = {}): void {
  if (process.env.OPENCODEKIT_LOG !== 'debug') return;
  const safe = redact(data) as Record<string, unknown>;
  process.stderr.write(
    `${JSON.stringify({ level: 'debug', time: new Date().toISOString(), event, ...safe })}\n`,
  );
}
