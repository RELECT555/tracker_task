import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  syncProblemHistoryQuerySchema,
  syncProblemListQuerySchema,
  type RoadmapAlertDetails,
  type RoadmapAlertKind,
  type RoadmapAlertResolution,
  type SyncProblemDto,
  type SyncProblemHistory,
  type SyncProblemPage,
  type SyncProblemStatus,
} from '@tracker/shared';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { alertAction, alertHint, formatAlert } from './roadmap-alert-format';

/** Problems that are not tied to one project; only administrators see them. */
const GLOBAL_KINDS: RoadmapAlertKind[] = ['azure_auth', 'webhook_silent'];
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface SyncProblemsViewer {
  id: string;
  email: string;
  isAdmin: boolean;
}

interface Scope {
  where: Prisma.RoadmapAlertWhereInput;
  projects: { id: string; name: string }[];
}

/** The sync problems page (sync problems page spec §4–§5); access is applied in every query. */
@Injectable()
export class RoadmapSyncProblemsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Admins see everything; planners see their projects' problems; others see nothing. */
  async canView(viewer: SyncProblemsViewer): Promise<boolean> {
    if (viewer.isAdmin) return true;
    const grant = await this.prisma.roadmapProjectAccess.findFirst({
      where: { email: normalizeEmail(viewer.email), role: 'planner' },
      select: { projectId: true },
    });
    return grant !== null;
  }

  async list(
    viewer: SyncProblemsViewer,
    query: unknown,
  ): Promise<SyncProblemPage> {
    const parsed = syncProblemListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException('Некорректные параметры списка проблем');
    }
    const { status, projectId, cursor, limit } = parsed.data;
    const scope = await this.scope(viewer);
    if (
      projectId &&
      !scope.projects.some((project) => project.id === projectId)
    ) {
      throw new ForbiddenException('Нет доступа к проблемам этого проекта');
    }

    const base: Prisma.RoadmapAlertWhereInput = {
      AND: [
        scope.where,
        { episodes: { some: {} } },
        ...(projectId ? [{ projectId }] : []),
      ],
    };
    const where: Prisma.RoadmapAlertWhereInput =
      status === 'all'
        ? base
        : { AND: [base, { state: status === 'active' ? 'open' : 'resolved' }] };
    const orderBy: Prisma.RoadmapAlertOrderByWithRelationInput[] =
      status === 'active'
        ? [{ openedAt: 'desc' }, { id: 'desc' }]
        : status === 'resolved'
          ? [{ resolvedAt: 'desc' }, { id: 'desc' }]
          : // 'open' sorts before 'resolved'.
            [
              { state: 'asc' },
              { resolvedAt: 'desc' },
              { openedAt: 'desc' },
              { id: 'desc' },
            ];

    const [rows, active] = await Promise.all([
      this.prisma.roadmapAlert.findMany({
        where,
        orderBy,
        take: limit + 1,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        include: {
          project: { select: { name: true } },
          episodes: { orderBy: { generation: 'desc' }, take: 1 },
        },
      }),
      this.prisma.roadmapAlert.count({
        where: { AND: [base, { state: 'open' }] },
      }),
    ]);

    const page = rows.slice(0, limit);
    const stats = await this.episodeStats(page.map((row) => row.id));
    const items = page.flatMap((row): SyncProblemDto[] => {
      const latest = row.episodes[0];
      if (!latest) return [];
      const kind = row.kind as RoadmapAlertKind;
      const details = latest.details as RoadmapAlertDetails;
      const projectName = row.project?.name ?? null;
      const { title, body } = formatAlert(kind, details, projectName);
      const stat = stats.get(row.id);
      return [
        {
          alertId: row.id,
          episodeId: latest.id,
          kind,
          projectId: row.projectId,
          projectName,
          title,
          body,
          status: problemStatus(row.state, latest.resolution ?? row.resolution),
          openedAt: latest.openedAt.toISOString(),
          resolvedAt:
            row.state === 'open'
              ? null
              : (latest.resolvedAt?.toISOString() ?? null),
          peakCount: latest.peakCount,
          currentCount: details.count ?? null,
          recurrence7d: stat?.recent ?? 1,
          historyCount: Math.max((stat?.total ?? 1) - 1, 0),
          hint: alertHint(kind),
          action: alertAction(kind, row.projectId, viewer.isAdmin),
        },
      ];
    });

    return {
      items,
      nextCursor: rows.length > limit ? page[page.length - 1].id : null,
      counts: { active },
      projects: scope.projects,
    };
  }

  /** Earlier episodes of one problem, newest first; the latest episode is the list row itself. */
  async history(
    viewer: SyncProblemsViewer,
    alertId: string,
    query: unknown,
  ): Promise<SyncProblemHistory> {
    const parsed = syncProblemHistoryQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException('Некорректные параметры истории');
    }
    if (!UUID_PATTERN.test(alertId)) {
      throw new NotFoundException('Проблема не найдена');
    }
    const scope = await this.scope(viewer);
    const alert = await this.prisma.roadmapAlert.findFirst({
      where: { AND: [scope.where, { id: alertId }] },
      select: { id: true },
    });
    if (!alert) throw new NotFoundException('Проблема не найдена');

    const episodes = await this.prisma.roadmapAlertEpisode.findMany({
      where: { alertId },
      orderBy: { generation: 'desc' },
      skip: 1,
      take: parsed.data.limit,
    });
    return {
      items: episodes.map((episode) => ({
        episodeId: episode.id,
        openedAt: episode.openedAt.toISOString(),
        resolvedAt: episode.resolvedAt?.toISOString() ?? null,
        resolution:
          (episode.resolution as RoadmapAlertResolution | null) ?? null,
        peakCount: episode.peakCount,
        details: episode.details as RoadmapAlertDetails,
      })),
    };
  }

  private async scope(viewer: SyncProblemsViewer): Promise<Scope> {
    if (viewer.isAdmin) {
      const projects = await this.prisma.roadmapProject.findMany({
        where: { syncedAt: { not: null } },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      });
      return { where: {}, projects };
    }
    const grants = await this.prisma.roadmapProjectAccess.findMany({
      where: { email: normalizeEmail(viewer.email), role: 'planner' },
      select: { project: { select: { id: true, name: true } } },
    });
    if (grants.length === 0) {
      throw new ForbiddenException('Нет доступа к проблемам синхронизации');
    }
    const projects = grants
      .map((grant) => grant.project)
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    return {
      where: {
        projectId: { in: projects.map((project) => project.id) },
        kind: { notIn: GLOBAL_KINDS },
      },
      projects,
    };
  }

  /** Episode totals and 7-day recurrence for the page's problems in one query. */
  private async episodeStats(
    alertIds: string[],
  ): Promise<Map<string, { total: number; recent: number }>> {
    if (alertIds.length === 0) return new Map();
    const rows = await this.prisma.$queryRaw<
      { alert_id: string; total: number; recent: number }[]
    >`
      SELECT e.alert_id::text AS alert_id,
             count(*)::int AS total,
             count(*) FILTER (WHERE e.opened_at >= l.latest - interval '7 days')::int AS recent
      FROM roadmap_alert_episodes e
      JOIN (
        SELECT alert_id, max(opened_at) AS latest
        FROM roadmap_alert_episodes
        WHERE alert_id = ANY(${alertIds}::uuid[])
        GROUP BY alert_id
      ) l ON l.alert_id = e.alert_id
      GROUP BY e.alert_id`;
    return new Map(
      rows.map((row) => [
        row.alert_id,
        { total: row.total, recent: row.recent },
      ]),
    );
  }
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function problemStatus(
  state: string,
  resolution: string | null,
): SyncProblemStatus {
  if (state === 'open') return 'active';
  return resolution === 'obsolete' ? 'obsolete' : 'fixed';
}
