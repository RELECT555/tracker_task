import { Injectable } from '@nestjs/common';
import { ValidationError } from '../../../shared/domain/domain.error';
import {
  AuditLogRepository,
  type ListAuditLogsResult,
} from '../domain/audit-log.repository';

export interface ListAuditLogsCommand {
  page?: number;
  limit?: number;
  entityType?: string;
  actorId?: string;
}

@Injectable()
export class ListAuditLogsHandler {
  constructor(private readonly auditLogs: AuditLogRepository) {}

  async execute(command: ListAuditLogsCommand = {}): Promise<ListAuditLogsResult> {
    const page = command.page ?? 1;
    const limit = command.limit ?? 50;

    if (page < 1) {
      throw new ValidationError('page must be >= 1');
    }
    if (limit < 1 || limit > 100) {
      throw new ValidationError('limit must be between 1 and 100');
    }

    return this.auditLogs.list({
      page,
      limit,
      entityType: command.entityType,
      actorId: command.actorId,
    });
  }
}
