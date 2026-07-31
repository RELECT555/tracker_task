import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from '../../../../shared/domain/domain.error';
import { PrismaService } from '../../../../shared/infrastructure/prisma/prisma.service';
import { AuditRecorder } from '../../../audit/application/audit-recorder';
import { buildAuditChanges } from '../../../audit/application/build-audit-changes';
import { AuditActions, AuditEntityTypes } from '../../../audit/domain/audit-action';
import {
  normalizeFieldSchema,
  normalizeRequestTypeCode,
} from '../../domain/field-schema';

export interface UpdateAdminRequestTypeCommand {
  id: string;
  actorId: string;
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
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditRecorder,
  ) {}

  async execute(command: UpdateAdminRequestTypeCommand) {
    const existing = await this.prisma.requestType.findUnique({
      where: { id: command.id },
    });
    if (!existing) {
      throw new NotFoundError('RequestType', command.id);
    }

    const before = {
      code: existing.code,
      name: existing.name,
      description: existing.description,
      isActive: existing.isActive,
      defaultRouteTemplateId: existing.defaultRouteTemplateId,
      allowedManualRoutes: existing.allowedManualRoutes,
      allowsPersonalRoute: existing.allowsPersonalRoute,
      maxPersonalRouteSteps: existing.maxPersonalRouteSteps,
      fieldSchema: existing.fieldSchema,
    };

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
          throw new ValidationError(`Тип с кодом «${code}» уже существует`);
        }
      }
      data.code = code;
    }

    if (command.name !== undefined) {
      const name = command.name.trim();
      if (!name) {
        throw new ValidationError('Укажите название типа запроса');
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

    const nextDefaultRoute =
      command.defaultRouteTemplateId !== undefined
        ? command.defaultRouteTemplateId
        : existing.defaultRouteTemplateId;
    const nextAllowsPersonal =
      command.allowsPersonalRoute !== undefined
        ? command.allowsPersonalRoute
        : existing.allowsPersonalRoute;

    if (!nextDefaultRoute && !nextAllowsPersonal) {
      throw new ValidationError(
        'Укажите маршрут по умолчанию или включите персональный маршрут',
      );
    }

    await this.prisma.requestType.update({
      where: { id: command.id },
      data,
    });

    const after = {
      code: data.code ?? before.code,
      name: data.name ?? before.name,
      description:
        command.description !== undefined ? data.description : before.description,
      isActive: data.isActive ?? before.isActive,
      defaultRouteTemplateId:
        command.defaultRouteTemplateId !== undefined
          ? data.defaultRouteTemplateId
          : before.defaultRouteTemplateId,
      allowedManualRoutes:
        command.allowedManualRoutes !== undefined
          ? data.allowedManualRoutes
          : before.allowedManualRoutes,
      allowsPersonalRoute: data.allowsPersonalRoute ?? before.allowsPersonalRoute,
      maxPersonalRouteSteps:
        data.maxPersonalRouteSteps ?? before.maxPersonalRouteSteps,
      fieldSchema:
        command.fieldSchema !== undefined ? data.fieldSchema : before.fieldSchema,
    };

    const changes = buildAuditChanges(
      before as Record<string, unknown>,
      after as Record<string, unknown>,
    );
    if (changes) {
      await this.audit.record({
        actorId: command.actorId,
        action: AuditActions.REQUEST_TYPE_UPDATED,
        entityType: AuditEntityTypes.REQUEST_TYPE,
        entityId: command.id,
        payload: { changes },
      });
    }

    return { id: command.id };
  }
}
