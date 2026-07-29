import { Injectable } from '@nestjs/common';
import { PrismaRequestTypeReader } from '../../infrastructure/routing.readers.impl';
import type { RequestTypeRecord } from '../../../request/domain/request.repository';

@Injectable()
export class ListRequestTypesHandler {
  constructor(private readonly reader: PrismaRequestTypeReader) {}

  async execute() {
    const types = await this.reader.listActive();
    return {
      data: types.map((t: RequestTypeRecord) => ({
        id: t.id,
        code: t.code,
        name: t.name,
        description: t.description,
        fieldSchema: t.fieldSchema,
        defaultRouteTemplateId: t.defaultRouteTemplateId,
        allowedManualRoutes: t.allowedManualRoutes,
        allowsPersonalRoute: t.allowsPersonalRoute,
        maxPersonalRouteSteps: t.maxPersonalRouteSteps,
      })),
    };
  }
}
