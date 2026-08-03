import type { RequestPriority, RequestStatus } from '@tracker/shared';
import { Request } from './request.entity';

export interface OutboxFilters {
  status?: RequestStatus;
  page: number;
  limit: number;
}

export abstract class RequestRepository {
  abstract findById(id: string): Promise<Request | null>;
  abstract save(request: Request): Promise<void>;
}

export abstract class RequestTypeReader {
  abstract findById(id: string): Promise<RequestTypeRecord | null>;
  abstract listActive(): Promise<RequestTypeRecord[]>;
}

export interface RequestTypeRecord {
  id: string;
  code: string;
  name: string;
  description: string | null;
  fieldSchema: unknown;
  isActive: boolean;
  defaultRouteTemplateId: string | null;
  allowedManualRoutes: string[];
  allowsPersonalRoute: boolean;
  maxPersonalRouteSteps: number;
}

export interface AuthorContext {
  id: string;
  orgUnitId: string;
  managerId: string | null;
}

export interface UserSummary {
  id: string;
  fullName: string;
  email: string;
}

export abstract class UserReader {
  abstract findById(id: string): Promise<UserSummary | null>;
  abstract findAuthorContext(id: string): Promise<AuthorContext | null>;
  abstract findManagerId(userId: string): Promise<string | null>;
}
