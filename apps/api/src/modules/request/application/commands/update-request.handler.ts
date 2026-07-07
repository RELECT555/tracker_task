import { Injectable } from '@nestjs/common';
import type { RequestPriority } from '@tracker/shared';
import { NotFoundError } from '../../../../shared/domain/domain.error';
import { RequestRepository } from '../../domain/request.repository';
import { GetRequestHandler } from '../queries/get-request.handler';

export interface UpdateRequestCommand {
  requestId: string;
  actorId: string;
  title?: string;
  fields?: Record<string, unknown>;
  priority?: RequestPriority;
}

@Injectable()
export class UpdateRequestHandler {
  constructor(
    private readonly requestRepo: RequestRepository,
    private readonly getRequestHandler: GetRequestHandler,
  ) {}

  async execute(command: UpdateRequestCommand) {
    const request = await this.requestRepo.findById(command.requestId);
    if (!request) throw new NotFoundError('Request', command.requestId);

    request.updateDraft(command.actorId, {
      title: command.title,
      fields: command.fields,
      priority: command.priority,
    });

    await this.requestRepo.save(request);

    return this.getRequestHandler.execute(command.requestId, command.actorId);
  }
}
