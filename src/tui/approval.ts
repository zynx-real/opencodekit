import type { ApprovalHandler, PermissionRequest } from '../permissions/manager.js';

export interface PendingApproval {
  request: PermissionRequest;
  resolve: (approved: boolean) => void;
}

export class ApprovalController {
  private listener: ((pending: PendingApproval) => void) | undefined;

  readonly handler: ApprovalHandler = async (request) =>
    await new Promise<boolean>((resolve) => {
      if (!this.listener) return resolve(false);
      this.listener({ request, resolve });
    });

  subscribe(listener: (pending: PendingApproval) => void): () => void {
    this.listener = listener;
    return () => {
      if (this.listener === listener) this.listener = undefined;
    };
  }
}
