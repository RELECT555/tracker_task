export interface RouteStepTemplateRecord {
  stepOrder: number;
  name: string;
  assigneeType: string;
  assigneeRef: string;
  slaHours: number | null;
  actions: string[];
}

export interface RouteTemplateRecord {
  id: string;
  name: string;
  version: number;
  steps: RouteStepTemplateRecord[];
}

export interface AuthorContext {
  id: string;
  orgUnitId: string;
  managerId: string | null;
}

export abstract class RouteTemplateRepository {
  abstract findPublishedById(id: string): Promise<RouteTemplateRecord | null>;
}
