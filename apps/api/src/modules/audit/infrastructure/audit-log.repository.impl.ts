import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import {
  AppendAuditLogInput,
  AuditLogRepository,
  ListAuditLogsQuery,
  ListAuditLogsResult,
} from '../domain/audit-log.repository';

@Injectable()
export class PrismaAuditLogRepository extends AuditLogRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async append(input: AppendAuditLogInput): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        id: randomUUID(),
        actorId: input.actorId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        payload: (input.payload ?? {}) as Prisma.InputJsonValue,
        ipAddress: input.ipAddress ?? null,
      },
    });
  }

  async list(query: ListAuditLogsQuery): Promise<ListAuditLogsResult> {
    const where: Prisma.AuditLogWhereInput = {};
    if (query.entityType) {
      where.entityType = query.entityType;
    }
    if (query.actorId) {
      where.actorId = query.actorId;
    }

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
        include: {
          actor: {
            select: { id: true, fullName: true, email: true },
          },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        id: row.id,
        action: row.action,
        entityType: row.entityType,
        entityId: row.entityId,
        payload: (row.payload ?? {}) as Record<string, unknown>,
        createdAt: row.createdAt,
        actor: row.actor
          ? {
              id: row.actor.id,
              fullName: row.actor.fullName,
              email: row.actor.email,
            }
          : null,
      })),
      total,
      page: query.page,
      limit: query.limit,
    };
  }
}
