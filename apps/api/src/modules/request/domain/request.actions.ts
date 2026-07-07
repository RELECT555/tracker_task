import type { RouteSnapshot } from '@tracker/shared';
import { AccessDeniedError, InvalidTransitionError } from '../../../shared/domain/domain.error';

export type RequestAction =
  | 'submit'
  | 'approve'
  | 'reject'
  | 'request_info'
  | 'provide_info'
  | 'escalate'
  | 'cancel';

const DEFAULT_STEP_ACTIONS: readonly string[] = ['approve', 'reject', 'request_info'];

function stepAllows(stepActions: string[] | undefined, action: string): boolean {
  const actions = stepActions ?? DEFAULT_STEP_ACTIONS;
  return actions.includes(action);
}

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

export interface EscalateStepResult {
  routeSnapshot: RouteSnapshot;
  stepIndex: number;
  newAssigneeId: string;
  newDueAt: Date | null;
}

export function escalateRouteStep(
  routeSnapshot: RouteSnapshot,
  currentStepIndex: number,
  newAssignee: { id: string; fullName: string },
): EscalateStepResult {
  const step = routeSnapshot.steps[currentStepIndex];
  if (!step) {
    throw new InvalidTransitionError('Current route step not found');
  }

  const dueAt =
    step.slaHours != null
      ? new Date(Date.now() + step.slaHours * 60 * 60 * 1000)
      : null;

  const steps = routeSnapshot.steps.map((routeStep, index) =>
    index === currentStepIndex
      ? {
          ...routeStep,
          assignee: { id: newAssignee.id, fullName: newAssignee.fullName },
          dueAt: dueAt?.toISOString() ?? null,
          status: 'active' as const,
        }
      : routeStep,
  );

  return {
    routeSnapshot: { ...routeSnapshot, steps },
    stepIndex: currentStepIndex,
    newAssigneeId: newAssignee.id,
    newDueAt: dueAt,
  };
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
      if (stepAllows(step.actions, 'approve')) actions.push('approve');
      if (stepAllows(step.actions, 'reject')) actions.push('reject');
      if (stepAllows(step.actions, 'request_info')) actions.push('request_info');
      if (stepAllows(step.actions, 'escalate')) actions.push('escalate');
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
