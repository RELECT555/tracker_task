import { Module } from '@nestjs/common';
import { CreateRequestHandler } from './application/commands/create-request.handler';
import { GetRequestHandler } from './application/queries/get-request.handler';
import { ListOutboxHandler } from './application/queries/list-outbox.handler';
import {
  RequestRepository,
  RequestTypeReader,
  UserReader,
} from './domain/request.repository';
import { PrismaRequestRepository } from './infrastructure/request.repository.impl';
import { RequestController } from './presentation/request.controller';
import {
  PrismaRequestTypeReader,
  PrismaUserReader,
} from '../routing/infrastructure/routing.readers.impl';

@Module({
  controllers: [RequestController],
  providers: [
    CreateRequestHandler,
    GetRequestHandler,
    ListOutboxHandler,
    PrismaRequestRepository,
    { provide: RequestRepository, useExisting: PrismaRequestRepository },
    PrismaRequestTypeReader,
    { provide: RequestTypeReader, useExisting: PrismaRequestTypeReader },
    PrismaUserReader,
    { provide: UserReader, useExisting: PrismaUserReader },
  ],
})
export class RequestModule {}
