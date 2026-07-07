import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { NotFoundError, ValidationError } from '../../../../shared/domain/domain.error';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import {
  normalizeFieldSchema,
  normalizeRequestTypeCode,
} from '../../domain/field-schema';

export interface CreateAdminRequestTypeCommand {
  code: string;
  name: string;
  description?: string | null;
  fieldSchema?: unknown;
  defaultRouteTemplateId?: string | null;
  allowedManualRoutes?: string[];
  allowsPersonalRoute?: boolean;
  maxPersonalRouteSteps?: number;
  isActive?: boolean;
}

@Injectable()
export class CreateAdminRequestTypeHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: CreateAdminRequestTypeCommand) {
    const code = normalizeRequestTypeCode(command.code);
    const name = command.name.trim();
    if (!name) {
      throw new ValidationError('Name is required');
    }

    const existing = await this.prisma.requestType.findUnique({ where: { code } });
    if (existing) {
      throw new ValidationError(`Request type with code "${code}" already exists`);
    }

    if (command.defaultRouteTemplateId) {
      await this.assertPublishedRoute(command.defaultRouteTemplateId);
    }

    const allowedManualRoutes = command.allowedManualRoutes ?? [];
    for (const routeId of allowedManualRoutes) {
      await this.assertPublishedRoute(routeId);
    }

    const fieldSchema = normalizeFieldSchema(command.fieldSchema ?? []);

    const created = await this.prisma.requestType.create({
      data: {
        id: randomUUID(),
        code,
        name,
        description: command.description?.trim() || null,
        fieldSchema: fieldSchema as unknown as Prisma.InputJsonValue,
        defaultRouteTemplateId: command.defaultRouteTemplateId ?? null,
        allowedManualRoutes,
        allowsPersonalRoute: command.allowsPersonalRoute ?? false,
        maxPersonalRouteSteps: command.maxPersonalRouteSteps ?? 5,
        isActive: command.isActive ?? true,
      },
    });

    return { id: created.id };
  }

  private async assertPublishedRoute(routeTemplateId: string) {
    const route = await this.prisma.routeTemplate.findFirst({
      where: { id: routeTemplateId, isPublished: true },
    });
    if (!route) {
      throw new NotFoundError('RouteTemplate', routeTemplateId);
    }
  }
}
