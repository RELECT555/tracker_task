import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { BusinessRuleViolationError, NotFoundError } from '../../../../shared/domain/domain.error';
import { UserReader } from '../../domain/request.repository';
import { PrismaRequestRepository } from '../../infrastructure/request.repository.impl';
import { RequestMapper } from '../../infrastructure/request.mapper';
import { EscalationService } from '../services/escalation.service';

export interface EscalateRequestCommand {
  requestId: string;
  actorId: string;
  reason: string;
}

@Injectable()
export class EscalateRequestHandler {
  constructor(
    private readonly userReader: UserReader,
    private readonly escalation: EscalationService,
    private readonly prismaRequestRepo: PrismaRequestRepository,
  ) {}

  async execute(command: EscalateRequestCommand) {
    const managerId = await this.userReader.findManagerId(command.actorId);
    if (!managerId) {
      throw new BusinessRuleViolationError('No manager available to escalate to');
    }

    const manager = await this.userReader.findById(managerId);
    if (!manager) {
      throw new BusinessRuleViolationError('Escalation target manager not found');
    }

    await this.escalation.perform({
      requestId: command.requestId,
      actorId: command.actorId,
      newAssignee: { id: manager.id, fullName: manager.fullName },
      action: 'escalate',
      comment: command.reason,
      metadata: { newAssigneeId: manager.id },
    });

    const record = await this.prismaRequestRepo.findByIdWithRelations(command.requestId);
    return RequestMapper.toDetail(record!, command.actorId);
  }
}
