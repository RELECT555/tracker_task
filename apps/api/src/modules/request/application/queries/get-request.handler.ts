import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../../shared/domain/domain.error';
import { PrismaRequestRepository } from '../../infrastructure/request.repository.impl';
import { RequestMapper } from '../../infrastructure/request.mapper';

@Injectable()
export class GetRequestHandler {
  constructor(private readonly requestRepo: PrismaRequestRepository) {}

  async execute(requestId: string, actorId?: string) {
    const record = await this.requestRepo.findByIdWithRelations(requestId);
    if (!record) throw new NotFoundError('Request', requestId);
    return RequestMapper.toDetail(record, actorId);
  }
}
