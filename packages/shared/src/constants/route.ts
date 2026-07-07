export const ROUTE_STEP_STATUSES = ['active', 'pending', 'completed', 'skipped'] as const;

export type RouteStepStatus = (typeof ROUTE_STEP_STATUSES)[number];

export const ASSIGNEE_TYPES = [
  'user',
  'role',
  'org_unit_head',
  'manager_chain',
  'dynamic',
  'pool',
] as const;

export type AssigneeType = (typeof ASSIGNEE_TYPES)[number];

export interface RouteAssigneeSnapshot {
  id: string;
  fullName: string;
}

export interface RouteStepSnapshot {
  index: number;
  name: string;
  assignee: RouteAssigneeSnapshot;
  status: RouteStepStatus;
  slaHours: number | null;
  dueAt: string | null;
}

export interface RouteSnapshot {
  templateId: string;
  templateVersion: number;
  steps: RouteStepSnapshot[];
}
