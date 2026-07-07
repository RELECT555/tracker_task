import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '../../../../shared/domain/domain.error';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import {
  normalizeFieldSchema,
  normalizeRequestTypeCode,
} from '../../domain/field-schema';

export interface UpdateAdminRequestTypeCommand {
  id: string;
  code?: string;
  name?: string;
  description?: string | null;
  fieldSchema?: unknown;
  defaultRouteTemplateId?: string | null;
  allowedManualRoutes?: string[];
  allowsPersonalRoute?: boolean;
  maxPersonalRouteSteps?: number;
  isActive?: boolean;
}

@Injectable()
export class UpdateAdminRequestTypeHandler {
  constructor(private readonly prisma: PrismaService) {}

  async execute(command: UpdateAdminRequestTypeCommand) {
    const existing = await this.prisma.requestType.findUnique({
      where: { id: command.id },
    });
    if (!existing) {
      throw new NotFoundError('RequestType', command.id);
    }

    const data: {
      code?: string;
      name?: string;
      description?: string | null;
      fieldSchema?: Prisma.InputJsonValue;
      defaultRouteTemplateId?: string | null;
      allowedManualRoutes?: string[];
      allowsPersonalRoute?: boolean;
      maxPersonalRouteSteps?: number;
      isActive?: boolean;
    } = {};

    if (command.code !== undefined) {
      const code = normalizeRequestTypeCode(command.code);
      if (code !== existing.code) {
        const duplicate = await this.prisma.requestType.findUnique({ where: { code } });
        if (duplicate) {
          throw new ValidationError(`Request type with code "${code}" already exists`);
        }
      }
      data.code = code;
    }

    if (command.name !== undefined) {
      const name = command.name.trim();
      if (!name) {
        throw new ValidationError('Name is required');
      }
      data.name = name;
    }

    if (command.description !== undefined) {
      data.description = command.description?.trim() || null;
    }

    if (command.fieldSchema !== undefined) {
      data.fieldSchema = normalizeFieldSchema(
        command.fieldSchema,
      ) as unknown as Prisma.InputJsonValue;
    }

    if (command.defaultRouteTemplateId !== undefined) {
      if (command.defaultRouteTemplateId) {
        const route = await this.prisma.routeTemplate.findFirst({
          where: { id: command.defaultRouteTemplateId, isPublished: true },
        });
        if (!route) {
          throw new NotFoundError('RouteTemplate', command.defaultRouteTemplateId);
        }
      }
      data.defaultRouteTemplateId = command.defaultRouteTemplateId;
    }

    if (command.allowedManualRoutes !== undefined) {
      for (const routeId of command.allowedManualRoutes) {
        const route = await this.prisma.routeTemplate.findFirst({
          where: { id: routeId, isPublished: true },
        });
        if (!route) {
          throw new NotFoundError('RouteTemplate', routeId);
        }
      }
      data.allowedManualRoutes = command.allowedManualRoutes;
    }

    if (command.allowsPersonalRoute !== undefined) {
      data.allowsPersonalRoute = command.allowsPersonalRoute;
    }

    if (command.maxPersonalRouteSteps !== undefined) {
      data.maxPersonalRouteSteps = command.maxPersonalRouteSteps;
    }

    if (command.isActive !== undefined) {
      data.isActive = command.isActive;
    }

    await this.prisma.requestType.update({
      where: { id: command.id },
      data,
    });

    return { id: command.id };
  }
}
