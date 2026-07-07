import { Module } from '@nestjs/common';
import { RoutingModule } from '../routing/routing.module';
import { ApproveRequestHandler } from './application/commands/approve-request.handler';
import { CancelRequestHandler } from './application/commands/cancel-request.handler';
import { ProvideInfoHandler } from './application/commands/provide-info.handler';
import { RequestInfoHandler } from './application/commands/request-info.handler';
import { RejectRequestHandler } from './application/commands/reject-request.handler';
import { SubmitRequestHandler } from './application/commands/submit-request.handler';
import { CreateRequestHandler } from './application/commands/create-request.handler';
import { GetRequestHandler } from './application/queries/get-request.handler';
import { ListInboxHandler } from './application/queries/list-inbox.handler';
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
  imports: [RoutingModule],
  controllers: [RequestController],
  providers: [
    CreateRequestHandler,
    SubmitRequestHandler,
    ApproveRequestHandler,
    RejectRequestHandler,
    CancelRequestHandler,
    RequestInfoHandler,
    ProvideInfoHandler,
    GetRequestHandler,
    ListOutboxHandler,
    ListInboxHandler,
    PrismaRequestRepository,
    { provide: RequestRepository, useExisting: PrismaRequestRepository },
    PrismaRequestTypeReader,
    { provide: RequestTypeReader, useExisting: PrismaRequestTypeReader },
    PrismaUserReader,
    { provide: UserReader, useExisting: PrismaUserReader },
  ],
})
export class RequestModule {}
