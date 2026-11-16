import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  roadmapNotificationListQuerySchema,
  type RoadmapAlertDetails,
  type RoadmapAlertKind,
  type RoadmapAlertResolution,
  type RoadmapNotificationDto,
  type RoadmapNotificationPage,
  type RoadmapNotificationSummary,
} from '@tracker/shared';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { alertLink } from './roadmap-alert-format';
import {
  RoadmapSyncProblemsService,
  type SyncProblemsViewer,
} from './roadmap-sync-problems.service';

const PLAN_PAGE = '/roadmap';
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A user's sync health notifications (spec §6); every query is scoped to that user. */
@Injectable()
export class RoadmapNotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly syncProblems: RoadmapSyncProblemsService,
  ) {}

  async list(
    user: { id: string; isAdmin: boolean },
    query: unknown,
  ): Promise<RoadmapNotificationPage> {
    const parsed = roadmapNotificationListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException(
        'Некорректные параметры списка уведомлений',
      );
    }
    const { cursor, limit } = parsed.data;

    const rows = await this.prisma.roadmapNotification.findMany({
      where: { userId: user.id },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        alert: {
          select: {
            state: true,
            generation: true,
            details: true,
            resolution: true,
            project: { select: { name: true } },
          },
        },
      },
    });

    const page = rows.slice(0, limit);
    const episodes = page.length
      ? await this.prisma.roadmapAlertEpisode.findMany({
          where: {
            OR: page.map((row) => ({
              alertId: row.alertId,
              generation: row.generation,
            })),
          },
          select: { alertId: true, generation: true, openedCount: true },
        })
      : [];
    const openedCounts = new Map(
      episodes.map((e) => [`${e.alertId}:${e.generation}`, e.openedCount]),
    );

    const items = page.map((row): RoadmapNotificationDto => {
      const { alert } = row;
      const sameEpisode = alert.generation === row.generation;
      const active = alert.state === 'open' && sameEpisode;
      const kind = row.kind as RoadmapAlertKind;
      return {
        id: row.id,
        kind,
        projectId: row.projectId,
        projectName: alert.project?.name ?? null,
        title: row.title,
        body: row.body,
        // Admin pages are closed to everyone else; planners get the plan itself.
        link: user.isAdmin ? alertLink(kind, row.projectId) : PLAN_PAGE,
        createdAt: row.createdAt.toISOString(),
        readAt: row.readAt?.toISOString() ?? null,
        active,
        // A newer episode means this one ended by itself; resolutions are not kept per episode.
        resolution: active
          ? null
          : sameEpisode
            ? ((alert.resolution as RoadmapAlertResolution | null) ?? null)
            : 'fixed',
        current: active ? (alert.details as RoadmapAlertDetails) : null,
        openedCount:
          openedCounts.get(`${row.alertId}:${row.generation}`) ?? null,
      };
    });

    return {
      items,
      nextCursor: rows.length > limit ? items[items.length - 1].id : null,
    };
  }

  async summary(user: SyncProblemsViewer): Promise<RoadmapNotificationSummary> {
    const userId = user.id;
    const [unread, openUnread, canViewSyncProblems] = await Promise.all([
      this.prisma.roadmapNotification.count({
        where: { userId, readAt: null },
      }),
      this.prisma.roadmapNotification.findMany({
        where: { userId, readAt: null, alert: { state: 'open' } },
        select: { generation: true, alert: { select: { generation: true } } },
      }),
      this.syncProblems.canView(user),
    ]);
    return {
      canViewSyncProblems,
      unread,
      activeUnread: openUnread.filter(
        (row) => row.generation === row.alert.generation,
      ).length,
    };
  }

  async markRead(userId: string, id: string): Promise<void> {
    // A malformed id would fail the uuid column cast; it cannot be the user's notification.
    if (!UUID_PATTERN.test(id)) {
      throw new NotFoundException('Уведомление не найдено');
    }
    const updated = await this.prisma.roadmapNotification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    });
    if (updated.count > 0) return;
    // Already read is fine; missing or someone else's is not.
    const own = await this.prisma.roadmapNotification.findFirst({
      where: { id, userId },
      select: { id: true },
    });
    if (!own) throw new NotFoundException('Уведомление не найдено');
  }

  async markAllRead(userId: string): Promise<void> {
    await this.prisma.roadmapNotification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
