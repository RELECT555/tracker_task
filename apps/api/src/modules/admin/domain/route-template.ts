import { ASSIGNEE_TYPES, ROUTE_STEP_ACTIONS } from '@tracker/shared';
import { ValidationError } from '../../../shared/domain/domain.error';

export interface RouteStepInput {
  order: number;
  name: string;
  assigneeType: string;
  assigneeRef: string;
  actions: string[];
  slaHours: number | null;
}

const ASSIGNEE_TYPE_SET = new Set<string>(
  ASSIGNEE_TYPES.filter((type) => type !== 'pool'),
);
const ACTION_SET = new Set<string>(ROUTE_STEP_ACTIONS);

export function normalizeRouteSteps(raw: unknown): RouteStepInput[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new ValidationError('At least one route step is required');
  }

  const orders = new Set<number>();

  return raw.map((item, index) => {
    if (!item || typeof item !== 'object') {
      throw new ValidationError(`steps[${index}] must be an object`);
    }

    const step = item as Record<string, unknown>;
    const order = Number(step.order ?? index);
    const name = String(step.name ?? '').trim();
    const assigneeType = String(step.assigneeType ?? '').trim();
    const assigneeRef = String(step.assigneeRef ?? '').trim();

    if (!Number.isInteger(order) || order < 0) {
      throw new ValidationError(`steps[${index}].order must be a non-negative integer`);
    }

    if (orders.has(order)) {
      throw new ValidationError(`Duplicate step order: ${order}`);
    }
    orders.add(order);

    if (!name) {
      throw new ValidationError(`steps[${index}].name is required`);
    }

    if (!ASSIGNEE_TYPE_SET.has(assigneeType)) {
      throw new ValidationError(`Unsupported assignee type: ${assigneeType}`);
    }

    if (
      assigneeType !== 'org_unit_head' &&
      assigneeType !== 'pool' &&
      !assigneeRef
    ) {
      throw new ValidationError(`steps[${index}].assigneeRef is required for ${assigneeType}`);
    }

    const slaRaw = step.slaHours;
    const slaHours =
      slaRaw === null || slaRaw === undefined || slaRaw === ''
        ? null
        : Number(slaRaw);

    if (slaHours !== null && (!Number.isFinite(slaHours) || slaHours < 1)) {
      throw new ValidationError(`steps[${index}].slaHours must be a positive number`);
    }

    const actionsRaw = step.actions;
    const actions = Array.isArray(actionsRaw)
      ? actionsRaw.map((action) => String(action))
      : ['approve', 'reject'];

    if (actions.length === 0) {
      throw new ValidationError(`steps[${index}] must include at least one action`);
    }

    for (const action of actions) {
      if (!ACTION_SET.has(action)) {
        throw new ValidationError(`Unsupported action: ${action}`);
      }
    }

    return {
      order,
      name,
      assigneeType,
      assigneeRef: assigneeRef || '-',
      actions,
      slaHours,
    };
  });
}
