import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { RequestPriority } from '@tracker/shared';
import { NotFoundError } from '../../../../shared/domain/domain.error';
import { Request } from '../../domain/request.entity';
import {
  RequestRepository,
  RequestTypeReader,
  UserReader,
} from '../../domain/request.repository';

export interface CreateRequestCommand {
  typeId: string;
  authorId: string;
  title: string;
  fields?: Record<string, unknown>;
  priority?: RequestPriority;
}

@Injectable()
export class CreateRequestHandler {
  constructor(
    private readonly requestRepo: RequestRepository,
    private readonly requestTypeReader: RequestTypeReader,
    private readonly userReader: UserReader,
  ) {}

  async execute(command: CreateRequestCommand) {
    const [author, type] = await Promise.all([
      this.userReader.findById(command.authorId),
      this.requestTypeReader.findById(command.typeId),
    ]);

    if (!author) throw new NotFoundError('User', command.authorId);
    if (!type || !type.isActive) {
      throw new NotFoundError('RequestType', command.typeId);
    }

    const request = Request.create({
      id: randomUUID(),
      typeId: command.typeId,
      authorId: command.authorId,
      title: command.title,
      fields: command.fields,
      priority: command.priority,
    });

    await this.requestRepo.save(request);

    return {
      id: request.id,
      typeId: request.typeId,
      title: request.title,
      status: request.status,
      fields: request.fields,
      priority: request.priority,
      route: null,
      author: { id: author.id, fullName: author.fullName },
      createdAt: request.createdAt.toISOString(),
      updatedAt: request.updatedAt.toISOString(),
    };
  }
}
