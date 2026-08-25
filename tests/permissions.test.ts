import { describe, expect, it, vi } from 'vitest';
import { PermissionManager } from '../src/permissions/manager.js';

describe('PermissionManager', () => {
  it('allows reads without prompting', async () => {
    const approve = vi.fn(async () => false);
    await expect(
      new PermissionManager('ask', [], approve).check({
        kind: 'read',
        tool: 'read_file',
        description: 'read file',
      }),
    ).resolves.toBeUndefined();
    expect(approve).not.toHaveBeenCalled();
  });

  it('asks for writes and shell commands', async () => {
    const approve = vi.fn(async () => true);
    const manager = new PermissionManager('ask', [], approve);
    await manager.check({ kind: 'write', tool: 'write_file', description: 'edit x' });
    await manager.check({ kind: 'shell', tool: 'bash', description: 'run x' });
    expect(approve).toHaveBeenCalledTimes(2);
  });

  it('rejects mutations in plan mode', async () => {
    const manager = new PermissionManager('plan');
    await expect(
      manager.check({ kind: 'write', tool: 'write_file', description: 'edit' }),
    ).rejects.toThrow('Plan mode rejected');
  });

  it('supports command allow patterns and flags dangerous commands', () => {
    const manager = new PermissionManager('ask', ['vitest*']);
    expect(manager.classifyShell('vitest run')).toBe('read');
    expect(manager.classifyShell('git status')).toBe('read');
    expect(manager.classifyShell('rm -rf build')).toBe('high-risk');
  });
});
