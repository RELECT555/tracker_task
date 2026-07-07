import type { RouteSnapshot } from '@tracker/shared';
import { AccessDeniedError, InvalidTransitionError } from '../../../shared/domain/domain.error';

export type RequestAction =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'request_info'
  | 'provide_info'
  | 'cancel';

export interface ApproveStepResult {
  kind: 'advanced' | 'completed';
  routeSnapshot: RouteSnapshot;
  nextStepIndex?: number;
  nextAssigneeId?: string;
  nextDueAt?: Date | null;
}

export function assertActiveAssignee(
  routeSnapshot: RouteSnapshot | null,
  currentStepIndex: number | null,
  actorId: string,
): void {
  if (currentStepIndex === null || !routeSnapshot) {
    throw new InvalidTransitionError('Request has no active route step');
  }

  const step = routeSnapshot.steps[currentStepIndex];
  if (!step || step.status !== 'active') {
    throw new InvalidTransitionError('Current route step is not active');
  }

  if (step.assignee.id !== actorId) {
    throw new AccessDeniedError('You are not assigned to the current step');
  }
}

export function approveRouteStep(
  routeSnapshot: RouteSnapshot,
  currentStepIndex: number,
): ApproveStepResult {
  const steps = routeSnapshot.steps.map((step) => ({ ...step }));
  steps[currentStepIndex] = {
    ...steps[currentStepIndex]!,
    status: 'completed',
    dueAt: steps[currentStepIndex]!.dueAt,
  };

  const nextIndex = currentStepIndex + 1;
  if (nextIndex < steps.length) {
    const nextStep = steps[nextIndex]!;
    const dueAt =
      nextStep.slaHours != null
        ? new Date(Date.now() + nextStep.slaHours * 60 * 60 * 1000)
        : null;

    steps[nextIndex] = {
      ...nextStep,
      status: 'active',
      dueAt: dueAt?.toISOString() ?? null,
    };

    return {
      kind: 'advanced',
      routeSnapshot: { ...routeSnapshot, steps },
      nextStepIndex: nextIndex,
      nextAssigneeId: nextStep.assignee.id,
      nextDueAt: dueAt,
    };
  }

  return {
    kind: 'completed',
    routeSnapshot: { ...routeSnapshot, steps },
  };
}

export function cancelRouteOnCancel(routeSnapshot: RouteSnapshot): RouteSnapshot {
  const steps = routeSnapshot.steps.map((step) =>
    step.status === 'active' || step.status === 'pending'
      ? { ...step, status: 'skipped' as const }
      : step,
  );

  return { ...routeSnapshot, steps };
}

export interface ProvideInfoResult {
  stepIndex: number;
  assigneeId: string;
  dueAt: Date | null;
}

export function computeAvailableActions(input: {
  status: string;
  authorId: string;
  routeSnapshot: RouteSnapshot | null;
  currentStepIndex: number | null;
  actorId?: string;
}): RequestAction[] {
  if (!input.actorId) return [];

  const actions: RequestAction[] = [];

  if (input.status === 'draft' && input.authorId === input.actorId) {
    actions.push('submit');
  }

  if (input.status === 'in_progress' && input.routeSnapshot && input.currentStepIndex !== null) {
    const step = input.routeSnapshot.steps[input.currentStepIndex];
    if (step?.status === 'active' && step.assignee.id === input.actorId) {
      actions.push('approve', 'reject', 'request_info');
    }
  }

  if (input.status === 'pending_info' && input.authorId === input.actorId) {
    actions.push('provide_info');
  }

  if (
    ['draft', 'in_progress', 'pending_info'].includes(input.status) &&
    input.authorId === input.actorId
  ) {
    actions.push('cancel');
  }

  return actions;
}
