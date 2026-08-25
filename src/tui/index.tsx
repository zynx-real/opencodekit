import React from 'react';
import { render } from 'ink';
import type { AgentRunner } from '../agent/runner.js';
import { App } from './app.js';
import type { ApprovalController } from './approval.js';

export async function runTui(
  runner: AgentRunner,
  approvals: ApprovalController,
): Promise<void> {
  const instance = render(<App runner={runner} approvals={approvals} />);
  await instance.waitUntilExit();
}
