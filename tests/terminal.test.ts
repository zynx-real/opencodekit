import { describe, expect, it, vi } from 'vitest';
import { clearTerminal, clearTerminalSequence } from '../src/tui/terminal.js';

describe('terminal startup', () => {
  it('clears scrollback, screen, then moves the cursor home', () => {
    const write = vi.fn();
    clearTerminal({ write });
    expect(write).toHaveBeenCalledWith('\u001b[3J\u001b[2J\u001b[H');
    expect(clearTerminalSequence).toBe('\u001b[3J\u001b[2J\u001b[H');
  });
});
