import type { Transition, User } from '@prisma/client';
import type { RequestStatus } from '@tracker/shared';

type TransitionWithActor = Transition & { actor: User | null };

export class TransitionMapper {
  static toDto(record: TransitionWithActor) {
    return {
      id: record.id,
      fromStatus: record.fromStatus as RequestStatus | null,
      toStatus: record.toStatus as RequestStatus,
      fromStep: record.fromStep,
      toStep: record.toStep,
      action: record.action,
      actor: record.actor
        ? { id: record.actor.id, fullName: record.actor.fullName }
        : null,
      comment: record.comment,
      createdAt: record.createdAt.toISOString(),
    };
  }
}
