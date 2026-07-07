import type { Request as PrismaRequest, RequestType, User } from '@prisma/client';
import type { RequestPriority, RequestStatus, RouteSnapshot } from '@tracker/shared';
import { Request } from '../domain/request.entity';
import { computeAvailableActions } from '../domain/request.actions';

type PrismaRequestWithRelations = PrismaRequest & {
  type?: RequestType;
  author?: User;
};

export class RequestMapper {
  static toDomain(record: PrismaRequest): Request {
    return Request.rehydrate({
      id: record.id,
      typeId: record.typeId,
      authorId: record.authorId,
      title: record.title,
      fields: (record.fields as Record<string, unknown>) ?? {},
      status: record.status as RequestStatus,
      priority: record.priority as RequestPriority,
      routeSnapshot: record.routeSnapshot,
      currentStepIndex: record.currentStepIndex,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      submittedAt: record.submittedAt,
      completedAt: record.completedAt,
    });
  }

  static toListItem(record: PrismaRequestWithRelations) {
    return {
      id: record.id,
      title: record.title,
      status: record.status as RequestStatus,
      priority: record.priority as RequestPriority,
      type: record.type
        ? { id: record.type.id, name: record.type.name }
        : { id: record.typeId, name: '—' },
      author: record.author
        ? { id: record.author.id, fullName: record.author.fullName }
        : { id: record.authorId, fullName: '—' },
      createdAt: record.createdAt.toISOString(),
      submittedAt: record.submittedAt?.toISOString() ?? null,
    };
  }

  static toDetail(record: PrismaRequestWithRelations, actorId?: string) {
    const route = record.routeSnapshot as RouteSnapshot | null;

    return {
      id: record.id,
      typeId: record.typeId,
      type: record.type
        ? { id: record.type.id, name: record.type.name, code: record.type.code }
        : null,
      title: record.title,
      status: record.status as RequestStatus,
      fields: record.fields as Record<string, unknown>,
      priority: record.priority as RequestPriority,
      route,
      currentStepIndex: record.currentStepIndex,
      author: record.author
        ? { id: record.author.id, fullName: record.author.fullName }
        : { id: record.authorId, fullName: '—' },
      availableActions: computeAvailableActions({
        status: record.status,
        authorId: record.authorId,
        routeSnapshot: route,
        currentStepIndex: record.currentStepIndex,
        actorId,
      }),
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      submittedAt: record.submittedAt?.toISOString() ?? null,
      completedAt: record.completedAt?.toISOString() ?? null,
    };
  }
}
