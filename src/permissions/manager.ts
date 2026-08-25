import type { PermissionMode } from '../config/schema.js';

export type OperationKind = 'read' | 'write' | 'delete' | 'shell' | 'high-risk';
export interface PermissionRequest {
  kind: OperationKind;
  tool: string;
  description: string;
  command?: string;
}

export type ApprovalHandler = (request: PermissionRequest) => Promise<boolean>;

const dangerous = [
  /\brm\s+(-[^\s]*r[^\s]*f|-[^\s]*f[^\s]*r)\b/i,
  /git\s+(reset\s+--hard|clean\s+-|push\s+.*--force)/i,
  /\b(mkfs|shutdown|reboot)\b/i,
  /:\(\)\s*\{/,
];

const builtInSafeCommands = [
  'pwd',
  'ls',
  'git status',
  'git diff',
  'git log',
  'git show',
  'git branch --show-current',
  'npm test',
  'npm run test',
  'npm run lint',
  'npm run typecheck',
  'npm run build',
  'pnpm test',
  'bun test',
  'cargo test',
  'go test',
];

function globMatch(pattern: string, value: string): boolean {
  const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*');
  return new RegExp(`^${escaped}$`).test(value);
}

export class PermissionManager {
  constructor(
    private mode: PermissionMode,
    private readonly bashAllow: string[] = [],
    private readonly approve?: ApprovalHandler,
  ) {}

  getMode(): PermissionMode {
    return this.mode;
  }

  setMode(mode: PermissionMode): void {
    this.mode = mode;
  }

  classifyShell(command: string): OperationKind {
    if (dangerous.some((pattern) => pattern.test(command))) return 'high-risk';
    if (
      [...builtInSafeCommands, ...this.bashAllow].some((pattern) =>
        globMatch(pattern, command),
      )
    )
      return 'read';
    return 'shell';
  }

  async check(request: PermissionRequest): Promise<void> {
    if (this.mode === 'unrestricted') return;
    if (request.kind === 'read') return;
    if (this.mode === 'plan')
      throw new Error(`Plan mode rejected ${request.tool}: ${request.description}`);
    if (this.mode === 'auto-edit' && request.kind === 'write') return;
    if (!this.approve || !(await this.approve(request))) {
      throw new Error(`Permission denied for ${request.tool}: ${request.description}`);
    }
  }
}
