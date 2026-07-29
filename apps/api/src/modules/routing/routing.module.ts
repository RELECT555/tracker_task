import { Module } from '@nestjs/common';

import { AssigneeResolver } from './domain/assignee.resolver';

import { RouteBuilder } from './domain/route-builder.service';

import { RouteTemplateRepository } from './domain/route-template.repository';

import { ListRequestTypesHandler } from './application/queries/list-request-types.handler';

import { PrismaRouteTemplateRepository } from './infrastructure/route-template.repository.impl';

import { PrismaRequestTypeReader } from './infrastructure/routing.readers.impl';

import { RequestTypeController } from './presentation/request-type.controller';



@Module({

  controllers: [RequestTypeController],

  providers: [

    ListRequestTypesHandler,

    PrismaRequestTypeReader,

    PrismaRouteTemplateRepository,

    { provide: RouteTemplateRepository, useExisting: PrismaRouteTemplateRepository },

    AssigneeResolver,

    RouteBuilder,

  ],

  exports: [

    PrismaRequestTypeReader,

    RouteTemplateRepository,

    PrismaRouteTemplateRepository,

    AssigneeResolver,

    RouteBuilder,

  ],

})

export class RoutingModule {}


