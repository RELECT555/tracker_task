import { Module } from '@nestjs/common';
import { ListRequestTypesHandler } from './application/queries/list-request-types.handler';
import { PrismaRequestTypeReader } from './infrastructure/routing.readers.impl';
import { RequestTypeController } from './presentation/request-type.controller';

@Module({
  controllers: [RequestTypeController],
  providers: [ListRequestTypesHandler, PrismaRequestTypeReader],
  exports: [PrismaRequestTypeReader],
})
export class RoutingModule {}
