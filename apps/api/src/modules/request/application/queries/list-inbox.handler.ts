import { Injectable } from '@nestjs/common';

import { PrismaRequestRepository } from '../../infrastructure/request.repository.impl';



export interface ListInboxQuery {
  assigneeId: string;
  page?: number;
  limit?: number;
  sort?: 'sla' | 'recent';
}



@Injectable()

export class ListInboxHandler {

  constructor(private readonly requestRepo: PrismaRequestRepository) {}



  async execute(query: ListInboxQuery) {

    const page = query.page ?? 1;

    const limit = query.limit ?? 20;



    const { records, total } = await this.requestRepo.findInboxWithRelations(
      query.assigneeId,
      { page, limit, sort: query.sort ?? 'sla' },
    );



    return {

      data: records.map((record) => ({

        id: record.request.id,

        title: record.request.title,

        type: {

          id: record.request.type.id,

          name: record.request.type.name,

        },

        status: record.request.status,

        priority: record.request.priority,

        author: {

          id: record.request.author.id,

          fullName: record.request.author.fullName,

        },

        currentStep: {
          name:
            (record.request.routeSnapshot as { steps?: { name: string }[] } | null)
              ?.steps?.[record.stepIndex]?.name ?? '—',
          dueAt: record.dueAt?.toISOString() ?? null,
          assignedAt: record.assignedAt.toISOString(),
        },

        createdAt: record.request.createdAt.toISOString(),

      })),

      meta: { total, page, limit },

    };

  }

}

