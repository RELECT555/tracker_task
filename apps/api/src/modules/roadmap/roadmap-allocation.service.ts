import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { rebalanceAllocations } from '@tracker/shared';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { RoadmapAzureSyncService } from './roadmap-azure-sync.service';

/** The three month keys (YYYY-MM) of a YYYY-Qn quarter. */
function quarterMonthKeys(quarterKey: string) {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarterKey);
  if (!match) throw new BadRequestException('Quarter must use YYYY-Qn format');
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  return Array.from(
    { length: 3 },
    (_, index) =>
      `${year}-${String((quarter - 1) * 3 + index + 1).padStart(2, '0')}`,
  );
}

function assertAssignableWorkItem(type: string) {
  if (type.toLowerCase() === 'epic') {
    throw new BadRequestException('На эпики нельзя назначать исполнителей.');
  }
}

/** Saves plan allocations (estimates and monthly hours) and queues them for Azure DevOps. */
@Injectable()
export class RoadmapAllocationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly azureSync: RoadmapAzureSyncService,
  ) {}

  async saveAllocation(
    dto: {
      allocationId?: string;
      workItemId: string;
      roleId: string;
      personExternalId: string;
      personName: string;
      personEmail?: string;
      quarterKey: string;
      estimatedHours: number;
      periods: {
        monthKey?: string;
        label: string;
        startsAt: string;
        endsAt: string;
        hours: number;
      }[];
    },
    /** The caller sends the allocation to Azure DevOps itself (creating its Task). */
    options: { skipSync?: boolean } = {},
  ) {
    const monthKeys = dto.periods.flatMap((period) =>
      period.monthKey ? [period.monthKey] : [],
    );
    if (new Set(monthKeys).size !== monthKeys.length)
      throw new BadRequestException(
        'Only one plan value is allowed per allocation and month',
      );
    const quarterMonths = quarterMonthKeys(dto.quarterKey);
    for (const period of dto.periods) {
      const startsAt = Date.parse(period.startsAt);
      const endsAt = Date.parse(period.endsAt);
      if (
        !Number.isFinite(period.hours) ||
        Number.isNaN(startsAt) ||
        Number.isNaN(endsAt) ||
        startsAt > endsAt
      ) {
        throw new BadRequestException(
          'A plan period must have valid dates that start before they end',
        );
      }
      if (period.monthKey) {
        if (!quarterMonths.includes(period.monthKey)) {
          throw new BadRequestException(
            'A monthly plan must fall within the allocation quarter',
          );
        }
        const [year, month] = period.monthKey.split('-').map(Number);
        const monthStart = `${period.monthKey}-01`;
        const monthEnd = new Date(Date.UTC(year, month, 0))
          .toISOString()
          .slice(0, 10);
        if (
          period.startsAt.slice(0, 10) !== monthStart ||
          period.endsAt.slice(0, 10) !== monthEnd
        ) {
          throw new BadRequestException(
            'A monthly plan must cover exactly one calendar month',
          );
        }
        if (Math.abs(period.hours * 2 - Math.round(period.hours * 2)) > 1e-8) {
          throw new BadRequestException(
            'Monthly plan values must use half-hour increments',
          );
        }
      }
    }
    if (
      dto.periods.reduce((sum, period) => sum + period.hours, 0) >
      dto.estimatedHours + 1e-8
    ) {
      throw new BadRequestException(
        'Planned hours cannot exceed the allocation estimate',
      );
    }
    const allocation = await this.prisma
      .$transaction(
        async (tx) => {
          const workItem = await tx.roadmapWorkItem.findUnique({
            where: { id: dto.workItemId },
            select: { projectId: true, type: true },
          });
          if (!workItem)
            throw new NotFoundException('Roadmap work item was not found');
          assertAssignableWorkItem(workItem.type);
          const membership = await tx.roadmapRoleMember.findFirst({
            where: {
              roleId: dto.roleId,
              role: { projectId: workItem.projectId },
              person: { externalId: dto.personExternalId, isActive: true },
            },
            include: { person: true },
          });
          if (!membership)
            throw new BadRequestException(
              'The person must be active and assigned to this role',
            );

          const key = {
            workItemId: dto.workItemId,
            roleId: dto.roleId,
            personExternalId: dto.personExternalId,
            quarterKey: dto.quarterKey,
          };
          const values = {
            personName: membership.person.name,
            personEmail: membership.person.email,
            estimatedHours: dto.estimatedHours,
            ...this.azureSync.pendingUpdate,
          };

          let saved;
          if (dto.allocationId) {
            const current = await tx.roadmapAllocation.findUnique({
              where: { id: dto.allocationId },
              select: { workItemId: true, roleId: true },
            });
            if (
              !current ||
              current.workItemId !== dto.workItemId ||
              current.roleId !== dto.roleId
            ) {
              throw new NotFoundException('Roadmap allocation was not found');
            }
            const duplicate = await tx.roadmapAllocation.findFirst({
              where: { ...key, id: { not: dto.allocationId } },
              select: { id: true },
            });
            if (duplicate)
              throw new ConflictException(
                'This person already has an estimate for this work item, role and quarter',
              );
            saved = await tx.roadmapAllocation.update({
              where: { id: dto.allocationId },
              data: {
                ...values,
                personExternalId: dto.personExternalId,
                quarterKey: dto.quarterKey,
              },
            });
          } else {
            saved = await tx.roadmapAllocation.upsert({
              where: { workItemId_roleId_personExternalId_quarterKey: key },
              create: { ...key, ...values },
              update: values,
            });
          }

          await tx.roadmapPeriodAllocation.deleteMany({
            where: { allocationId: saved.id },
          });
          if (dto.periods.length) {
            await tx.roadmapPeriodAllocation.createMany({
              data: dto.periods.map((period) => ({
                allocationId: saved.id,
                monthKey: period.monthKey ?? null,
                label: period.label,
                startsAt: new Date(period.startsAt),
                endsAt: new Date(period.endsAt),
                hours: period.hours,
              })),
            });
          }
          return saved;
        },
        { isolationLevel: 'Serializable' },
      )
      .catch((error: unknown) => {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'P2034'
        ) {
          throw new ConflictException(
            'План изменился одновременно. Обновите страницу и повторите ввод.',
          );
        }
        throw error;
      });
    if (!options.skipSync)
      await this.azureSync.onAllocationSaved(allocation.id);
    return { ...allocation, periods: dto.periods };
  }

  async rebalanceAllocations(ids: string[]) {
    const changed = await this.prisma
      .$transaction(
        async (tx) => {
          const rows = await tx.roadmapAllocation.findMany({
            where: { id: { in: ids } },
            include: {
              workItem: { select: { type: true } },
              periods: { orderBy: [{ startsAt: 'asc' }, { id: 'asc' }] },
            },
            orderBy: { id: 'asc' },
          });
          const first = rows[0];
          if (
            !first ||
            rows.length < 2 ||
            rows.length !== ids.length ||
            rows.some(
              (row) =>
                row.workItemId !== first.workItemId ||
                row.roleId !== first.roleId ||
                row.quarterKey !== first.quarterKey,
            )
          ) {
            throw new ConflictException(
              'Состав назначений изменился. Обновите план и повторите действие.',
            );
          }
          assertAssignableWorkItem(first.workItem.type);
          const group = {
            workItemId: first.workItemId,
            roleId: first.roleId,
            quarterKey: first.quarterKey,
          };
          if (
            (await tx.roadmapAllocation.count({ where: group })) !== ids.length
          ) {
            throw new ConflictException(
              'Состав назначений изменился. Обновите план и повторите действие.',
            );
          }
          const balanced = rebalanceAllocations(
            rows.map((row) => ({
              id: row.id,
              estimatedHours: row.estimatedHours.toString(),
              periods: row.periods.map((period) => ({
                monthKey: period.monthKey,
                label: period.label,
                startsAt: period.startsAt.toISOString(),
                endsAt: period.endsAt.toISOString(),
                hours: period.hours.toString(),
              })),
            })),
          );
          if (!balanced)
            throw new BadRequestException(
              'Часы нельзя распределить с сохранением текущей оценки и шага 0,5 ч.',
            );

          for (const row of balanced) {
            await tx.roadmapAllocation.update({
              where: { id: row.id },
              data: {
                estimatedHours: row.estimatedHours,
                ...this.azureSync.pendingUpdate,
              },
            });
            await tx.roadmapPeriodAllocation.deleteMany({
              where: { allocationId: row.id },
            });
            if (row.periods.length) {
              await tx.roadmapPeriodAllocation.createMany({
                data: row.periods.map((period) => ({
                  ...period,
                  allocationId: row.id,
                  startsAt: new Date(period.startsAt),
                  endsAt: new Date(period.endsAt),
                })),
              });
            }
          }
          return balanced.map(({ id }) => id);
        },
        { isolationLevel: 'Serializable' },
      )
      .catch((error: unknown) => {
        if (
          error instanceof Error &&
          'code' in error &&
          error.code === 'P2034'
        ) {
          throw new ConflictException(
            'План изменился одновременно. Обновите страницу и повторите ввод.',
          );
        }
        throw error;
      });
    await Promise.all(
      changed.map((id) => this.azureSync.onAllocationSaved(id)),
    );
    return { updated: changed.length };
  }

  async saveAllocationQuarter(
    allocationId: string,
    quarterKey: string,
    months: { monthKey: string; hours: number }[],
  ) {
    const expectedMonths = quarterMonthKeys(quarterKey);
    if (
      months.length !== 3 ||
      new Set(months.map((month) => month.monthKey)).size !== 3 ||
      expectedMonths.some(
        (key) => !months.some((month) => month.monthKey === key),
      )
    ) {
      throw new BadRequestException(
        'A quarterly plan must include each of its three calendar months exactly once',
      );
    }
    if (
      months.some(
        (month) =>
          !Number.isFinite(month.hours) ||
          month.hours < 0 ||
          Math.abs(month.hours * 2 - Math.round(month.hours * 2)) > 1e-8,
      )
    ) {
      throw new BadRequestException(
        'Monthly plan values must be non-negative half-hour increments',
      );
    }

    const normalized = months.map(({ monthKey, hours }) => {
      const [year, monthNumber] = monthKey.split('-').map(Number);
      const startsAt = new Date(Date.UTC(year, monthNumber - 1, 1));
      const endsAt = new Date(Date.UTC(year, monthNumber, 0));
      return {
        monthKey,
        hours,
        startsAt,
        endsAt,
        label: new Intl.DateTimeFormat('ru-RU', {
          month: 'long',
          year: 'numeric',
          timeZone: 'UTC',
        }).format(startsAt),
      };
    });

    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const allocation = await tx.roadmapAllocation.findUnique({
            where: { id: allocationId },
            select: {
              id: true,
              estimatedHours: true,
              workItem: { select: { type: true } },
              periods: { select: { monthKey: true, hours: true } },
            },
          });
          if (!allocation)
            throw new NotFoundException('Roadmap allocation was not found');
          assertAssignableWorkItem(allocation.workItem.type);

          const monthKeys = normalized.map((month) => month.monthKey);
          const alreadyPlannedThisQuarter = allocation.periods
            .filter(
              (period) =>
                period.monthKey && monthKeys.includes(period.monthKey),
            )
            .reduce((sum, period) => sum + Number(period.hours), 0);
          const totalPlanned = allocation.periods.reduce(
            (sum, period) => sum + Number(period.hours),
            0,
          );
          const nextTotal =
            totalPlanned -
            alreadyPlannedThisQuarter +
            normalized.reduce((sum, month) => sum + month.hours, 0);
          if (nextTotal > Number(allocation.estimatedHours) + 1e-8) {
            throw new BadRequestException(
              `План превышает оценку на ${Math.ceil((nextTotal - Number(allocation.estimatedHours)) * 2) / 2} ч`,
            );
          }

          await tx.roadmapPeriodAllocation.deleteMany({
            where: { allocationId, monthKey: { in: monthKeys } },
          });
          const plannedMonths = normalized.filter((month) => month.hours > 0);
          if (plannedMonths.length) {
            await tx.roadmapPeriodAllocation.createMany({
              data: plannedMonths.map((month) => ({ allocationId, ...month })),
            });
          }
          return plannedMonths;
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'P2034') {
        throw new ConflictException(
          'План изменился одновременно. Обновите страницу и повторите ввод.',
        );
      }
      throw error;
    }
  }
}
