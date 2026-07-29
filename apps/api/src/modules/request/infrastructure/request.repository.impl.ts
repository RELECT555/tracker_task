import { Prisma } from '@prisma/client';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import { Request } from '../domain/request.entity';
import {
  OutboxFilters,
  OutboxResult,
  RequestRepository,
} from '../domain/request.repository';
import { RequestMapper } from './request.mapper';

@Injectable()
export class PrismaRequestRepository extends RequestRepository {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findById(id: string): Promise<Request | null> {
    const record = await this.prisma.request.findUnique({ where: { id } });
    return record ? RequestMapper.toDomain(record) : null;
  }

  async save(request: Request): Promise<void> {
    const props = request.toProps();
    await this.prisma.request.upsert({
      where: { id: props.id },
      create: {
        id: props.id,
        typeId: props.typeId,
        authorId: props.authorId,
        title: props.title,
        fields: props.fields as Prisma.InputJsonValue,
        status: props.status,
        priority: props.priority,
        routeSnapshot: props.routeSnapshot as Prisma.InputJsonValue | undefined,
        currentStepIndex: props.currentStepIndex,
        submittedAt: props.submittedAt,
        completedAt: props.completedAt,
      },
      update: {
        title: props.title,
        fields: props.fields as Prisma.InputJsonValue,
        status: props.status,
        priority: props.priority,
        routeSnapshot: props.routeSnapshot as Prisma.InputJsonValue | undefined,
        currentStepIndex: props.currentStepIndex,
        submittedAt: props.submittedAt,
        completedAt: props.completedAt,
      },
    });
  }

  async findOutbox(
    authorId: string,
    filters: OutboxFilters,
  ): Promise<OutboxResult> {
    const where = {
      authorId,
      ...(filters.status ? { status: filters.status } : {}),
    };

    const [records, total] = await Promise.all([
      this.prisma.request.findMany({
        where,
        include: { type: true, author: true },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.request.count({ where }),
    ]);

    return {
      items: records.map((r) => RequestMapper.toDomain(r)),
      total,
    };
  }

  async findByIdWithRelations(id: string) {
    return this.prisma.request.findUnique({
      where: { id },
      include: { type: true, author: true },
    });
  }

  async findOutboxWithRelations(authorId: string, filters: OutboxFilters) {
    const where = {
      authorId,
      ...(filters.status ? { status: filters.status } : {}),
    };

    const [records, total] = await Promise.all([
      this.prisma.request.findMany({
        where,
        include: { type: true, author: true },
        orderBy: { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.request.count({ where }),
    ]);

    return { records, total };
  }

  async findInboxWithRelations(
    assigneeId: string,
    filters: {
      page: number;
      limit: number;
      sort?: 'sla' | 'recent';
      scope?: 'active' | 'archive';
    },
  ) {
    const scope = filters.scope ?? 'active';

    const where =
      scope === 'archive'
        ? {
            assigneeId,
            status: 'completed',
          }
        : {
            assigneeId,
            status: 'pending',
            request: { status: 'in_progress' },
          };

    const orderBy =
      scope === 'archive'
        ? [
            { completedAt: { sort: 'desc' as const, nulls: 'last' as const } },
            { assignedAt: 'desc' as const },
          ]
        : filters.sort === 'recent'
          ? [{ assignedAt: 'desc' as const }]
          : [
              { dueAt: { sort: 'asc' as const, nulls: 'last' as const } },
              { assignedAt: 'asc' as const },
            ];

    const [records, total] = await Promise.all([
      this.prisma.assignment.findMany({
        where,
        include: {
          request: {
            include: { type: true, author: true },
          },
        },
        orderBy,
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      this.prisma.assignment.count({ where }),
    ]);

    return { records, total };
  }
}
