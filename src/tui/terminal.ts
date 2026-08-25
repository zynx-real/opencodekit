import type { Writable } from 'node:stream';

export const clearTerminalSequence = '\u001b[3J\u001b[2J\u001b[H';

export function clearTerminal(output: Pick<Writable, 'write'>): void {
  output.write(clearTerminalSequence);
}
