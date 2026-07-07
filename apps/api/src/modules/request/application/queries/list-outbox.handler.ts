import { Injectable } from '@nestjs/common';
import type { RequestStatus } from '@tracker/shared';
import { PrismaRequestRepository } from '../../infrastructure/request.repository.impl';
import { RequestMapper } from '../../infrastructure/request.mapper';

export interface ListOutboxQuery {
  authorId: string;
  status?: RequestStatus;
  page?: number;
  limit?: number;
}

@Injectable()
export class ListOutboxHandler {
  constructor(private readonly requestRepo: PrismaRequestRepository) {}

  async execute(query: ListOutboxQuery) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const { records, total } = await this.requestRepo.findOutboxWithRelations(
      query.authorId,
      { status: query.status, page, limit },
    );

    return {
      data: records.map((r) => RequestMapper.toListItem(r)),
      meta: { total, page, limit },
    };
  }
}
