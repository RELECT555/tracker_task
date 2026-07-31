import { Module } from '@nestjs/common';
import { AuditRecorder } from './application/audit-recorder';
import { ListAuditLogsHandler } from './application/queries/list-audit-logs.handler';
import { AuditLogRepository } from './domain/audit-log.repository';
import { PrismaAuditLogRepository } from './infrastructure/audit-log.repository.impl';

@Module({
  providers: [
    PrismaAuditLogRepository,
    { provide: AuditLogRepository, useExisting: PrismaAuditLogRepository },
    AuditRecorder,
    ListAuditLogsHandler,
  ],
  exports: [AuditRecorder, ListAuditLogsHandler],
})
export class AuditModule {}
