import { Injectable } from '@nestjs/common';
import type { AuditAction, AuditEntityType } from '../domain/audit-action';
import { AuditLogRepository } from '../domain/audit-log.repository';

export interface RecordAuditInput {
  actorId: string;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  payload?: Record<string, unknown>;
  ipAddress?: string | null;
}

/**
 * Write port for other modules. Append-only — no update/delete API.
 * Call once after a successful mutation; keep payloads small (diffs / key fields).
 */
@Injectable()
export class AuditRecorder {
  constructor(private readonly auditLogs: AuditLogRepository) {}

  async record(input: RecordAuditInput): Promise<void> {
    await this.auditLogs.append({
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      payload: input.payload ?? {},
      ipAddress: input.ipAddress ?? null,
    });
  }
}
