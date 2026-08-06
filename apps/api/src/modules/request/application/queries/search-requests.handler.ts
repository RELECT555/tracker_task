import { Injectable } from '@nestjs/common';
import { AdminChecker } from '../../../../shared/infrastructure/access/admin.checker';
import {
  isEmptyCriteria,
  normalizeSearchCriteria,
  type RawSearchInput,
} from '../../domain/request.search';
import { PrismaRequestRepository } from '../../infrastructure/request.repository.impl';
import { RequestMapper } from '../../infrastructure/request.mapper';

export interface SearchRequestsQuery extends RawSearchInput {
  actorId: string;
}

@Injectable()
export class SearchRequestsHandler {
  constructor(
    private readonly requestRepo: PrismaRequestRepository,
    private readonly adminChecker: AdminChecker,
  ) {}

  async execute({ actorId, ...raw }: SearchRequestsQuery) {
    const criteria = normalizeSearchCriteria(raw);

    // An unfiltered search would dump the whole table; make the caller narrow it.
    if (isEmptyCriteria(criteria)) {
      return {
        data: [],
        meta: { total: 0, page: criteria.page, limit: criteria.limit },
      };
    }

    const { records, total } = await this.requestRepo.searchWithRelations(criteria, {
      actorId,
      isAdmin: await this.adminChecker.isAdmin(actorId),
    });

    return {
      data: records.map((record) => RequestMapper.toListItem(record)),
      meta: { total, page: criteria.page, limit: criteria.limit },
    };
  }
}
