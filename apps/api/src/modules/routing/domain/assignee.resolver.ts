import { Injectable } from '@nestjs/common';
import { BusinessRuleViolationError } from '../../../shared/domain/domain.error';
import { PrismaService } from '../../../shared/infrastructure/prisma/prisma.service';
import type { UserSummary } from '../../request/domain/request.repository';
import type { AuthorContext, RouteStepTemplateRecord } from './route-template.repository';

@Injectable()
export class AssigneeResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    step: RouteStepTemplateRecord,
    author: AuthorContext,
    fields: Record<string, unknown>,
  ): Promise<UserSummary> {
    switch (step.assigneeType) {
      case 'user':
        return this.requireUser(step.assigneeRef);

      case 'manager_chain':
        return this.resolveManagerChain(author, Number.parseInt(step.assigneeRef, 10));

      case 'role':
        return this.resolveRole(step.assigneeRef, author.orgUnitId);

      case 'org_unit_head':
        return this.resolveOrgHead(author.orgUnitId);

      case 'dynamic': {
        const fieldKey = step.assigneeRef.replace('field:', '');
        const userId = fields[fieldKey];
        if (typeof userId !== 'string') {
          throw new BusinessRuleViolationError(
            `Dynamic assignee field "${fieldKey}" is missing`,
          );
        }
        return this.requireUser(userId);
      }

      default:
        throw new BusinessRuleViolationError(
          `Unsupported assignee type: ${step.assigneeType}`,
        );
    }
  }

  private async resolveManagerChain(
    author: AuthorContext,
    level: number,
  ): Promise<UserSummary> {
    if (level < 1) {
      throw new BusinessRuleViolationError('Manager chain level must be >= 1');
    }

    let currentId: string = author.id;

    for (let i = 0; i < level; i += 1) {
      const user = await this.prisma.user.findUnique({
        where: { id: currentId },
        select: { managerId: true },
      });

      if (!user?.managerId) {
        throw new BusinessRuleViolationError(
          `Manager chain level ${level} cannot be resolved for author`,
        );
      }

      currentId = user.managerId;
    }

    return this.requireUser(currentId);
  }

  private async resolveRole(roleCode: string, orgUnitId: string): Promise<UserSummary> {
    const inOrg = await this.prisma.user.findFirst({
      where: {
        isActive: true,
        orgUnitId,
        roles: { some: { role: { code: roleCode } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (inOrg) {
      return { id: inOrg.id, fullName: inOrg.fullName, email: inOrg.email };
    }

    const anyUser = await this.prisma.user.findFirst({
      where: {
        isActive: true,
        roles: { some: { role: { code: roleCode } } },
      },
      orderBy: { createdAt: 'asc' },
    });

    if (!anyUser) {
      throw new BusinessRuleViolationError(`No active user with role "${roleCode}"`);
    }

    return { id: anyUser.id, fullName: anyUser.fullName, email: anyUser.email };
  }

  private async resolveOrgHead(orgUnitId: string): Promise<UserSummary> {
    const orgUnit = await this.prisma.orgUnit.findUnique({
      where: { id: orgUnitId },
      select: { headId: true },
    });

    if (!orgUnit?.headId) {
      throw new BusinessRuleViolationError('Org unit has no head assigned');
    }

    return this.requireUser(orgUnit.headId);
  }

  private async requireUser(userId: string): Promise<UserSummary> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true },
    });

    if (!user) {
      throw new BusinessRuleViolationError(`Assignee user not found: ${userId}`);
    }

    return { id: user.id, fullName: user.fullName, email: user.email };
  }
}
