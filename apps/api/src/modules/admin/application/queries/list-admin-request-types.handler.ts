import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';

@Injectable()
export class ListAdminRequestTypesHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute() {
    const types = await this.prisma.requestType.findMany({
      orderBy: { name: 'asc' },
    });

    const routeIds = [
      ...new Set(
        types
          .map((type) => type.defaultRouteTemplateId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const routes = routeIds.length
      ? await this.prisma.routeTemplate.findMany({
          where: { id: { in: routeIds }, isPublished: true },
          orderBy: { version: 'desc' },
        })
      : [];

    const routeNameById = new Map<string, string>();
    for (const route of routes) {
      if (!routeNameById.has(route.id)) {
        routeNameById.set(route.id, route.name);
      }
    }

    return {
      data: types.map((type) => ({
        id: type.id,
        code: type.code,
        name: type.name,
        description: type.description,
        isActive: type.isActive,
        fieldSchema: type.fieldSchema,
        fieldCount: Array.isArray(type.fieldSchema) ? type.fieldSchema.length : 0,
        defaultRouteTemplateId: type.defaultRouteTemplateId,
        defaultRouteTemplateName: type.defaultRouteTemplateId
          ? (routeNameById.get(type.defaultRouteTemplateId) ?? null)
          : null,
        allowedManualRoutes: type.allowedManualRoutes,
        allowsPersonalRoute: type.allowsPersonalRoute,
        maxPersonalRouteSteps: type.maxPersonalRouteSteps,
        createdAt: type.createdAt.toISOString(),
        updatedAt: type.updatedAt.toISOString(),
      })),
    };
  }
}
