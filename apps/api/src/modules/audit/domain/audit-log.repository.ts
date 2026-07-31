export interface AuditLogRecord {
  id: string;
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: Date;
}

export interface AppendAuditLogInput {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  payload?: Record<string, unknown>;
  ipAddress?: string | null;
}

export interface ListAuditLogsQuery {
  page: number;
  limit: number;
  entityType?: string;
  actorId?: string;
}

export interface AuditLogListItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  payload: Record<string, unknown>;
  createdAt: Date;
  actor: { id: string; fullName: string; email: string } | null;
}

export interface ListAuditLogsResult {
  items: AuditLogListItem[];
  total: number;
  page: number;
  limit: number;
}

export abstract class AuditLogRepository {
  abstract append(input: AppendAuditLogInput): Promise<void>;
  abstract list(query: ListAuditLogsQuery): Promise<ListAuditLogsResult>;
}
