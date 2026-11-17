import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import {
  AzureDevOpsCredentials,
  RoadmapIntegrationService,
} from './roadmap-integration.service';
import {
  azureErrorMessage,
  CACHE_TTL_MS,
  type CacheEntry,
  type IterationNode,
} from './roadmap-azure-sync.shared';

type AzureFieldMetadata = {
  referenceName: string;
  name?: string;
  type?: string;
  isCustom?: boolean;
  readOnly?: boolean;
  isIdentity?: boolean;
  isPicklist?: boolean;
  alwaysRequired?: boolean;
  allowedValues?: string[];
  defaultValue?: unknown;
  helpText?: string;
};

/** Reads the Azure DevOps process of a project: work item types, fields, states and iterations. */
@Injectable()
export class RoadmapAzureProcessService {
  private readonly logger = new Logger(RoadmapAzureProcessService.name);
  private readonly apiVersion = '7.1';
  private readonly typeFieldCache = new Map<string, CacheEntry<Set<string>>>();
  private readonly fieldMetadataCache = new Map<
    string,
    CacheEntry<AzureFieldMetadata[]>
  >();
  private readonly iterationCache = new Map<
    string,
    CacheEntry<IterationNode | null>
  >();

  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: RoadmapIntegrationService,
  ) {}

  async workItemTypes(projectId: string) {
    const project = await this.prisma.roadmapProject.findUnique({
      where: { id: projectId },
      select: { externalId: true },
    });
    if (!project) throw new NotFoundException('Roadmap project was not found');
    const credentials = await this.integration.getCredentials();
    const result = await this.integration.requestJson<{
      value?: {
        name: string;
        referenceName?: string;
        icon?: { id?: string };
        color?: string;
      }[];
    }>(
      `${credentials.organizationUrl}/${encodeURIComponent(project.externalId)}/_apis/wit/workitemtypes?api-version=${this.apiVersion}`,
      undefined,
      credentials,
    );
    return (result.value ?? []).map((item) => ({
      name: item.name,
      referenceName: item.referenceName ?? item.name,
      icon: item.icon?.id,
      color: item.color,
    }));
  }

  async fields(projectId: string, workItemType: string, refresh = false) {
    const project = await this.prisma.roadmapProject.findUnique({
      where: { id: projectId },
      select: { externalId: true },
    });
    if (!project) throw new NotFoundException('Roadmap project was not found');
    const cacheKey = `${project.externalId}:${workItemType}`;
    const cached = this.fieldMetadataCache.get(cacheKey);
    if (!refresh && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS)
      return cached.value;
    const credentials = await this.integration.getCredentials();
    const [typeFields, globalFields] = await Promise.all([
      this.integration.requestJson<{ value?: AzureFieldMetadata[] }>(
        `${credentials.organizationUrl}/${encodeURIComponent(project.externalId)}/_apis/wit/workitemtypes/${encodeURIComponent(workItemType)}/fields?$expand=all&api-version=${this.apiVersion}`,
        undefined,
        credentials,
      ),
      this.integration.requestJson<{ value?: AzureFieldMetadata[] }>(
        `${credentials.organizationUrl}/_apis/wit/fields?api-version=${this.apiVersion}`,
        undefined,
        credentials,
      ),
    ]);
    const globalByName = new Map(
      (globalFields.value ?? []).map((field) => [field.referenceName, field]),
    );
    const result = (typeFields.value ?? []).map((field) => {
      const global = globalByName.get(field.referenceName);
      return {
        referenceName: field.referenceName,
        name: field.name ?? global?.name ?? field.referenceName,
        type: field.type ?? global?.type ?? 'string',
        isCustom:
          field.isCustom ??
          global?.isCustom ??
          field.referenceName.startsWith('Custom.'),
        readOnly: field.readOnly ?? global?.readOnly ?? false,
        isIdentity: field.isIdentity ?? global?.isIdentity ?? false,
        isPicklist: field.isPicklist ?? global?.isPicklist ?? false,
        alwaysRequired: field.alwaysRequired ?? false,
        allowedValues: field.allowedValues,
        defaultValue: field.defaultValue,
        helpText: field.helpText ?? global?.helpText,
      };
    });
    this.fieldMetadataCache.set(cacheKey, {
      value: result,
      loadedAt: Date.now(),
    });
    return result;
  }

  async states(projectId: string, workItemType: string) {
    const project = await this.prisma.roadmapProject.findUnique({
      where: { id: projectId },
      select: { externalId: true },
    });
    if (!project) throw new NotFoundException('Roadmap project was not found');
    const credentials = await this.integration.getCredentials();
    const result = await this.integration.requestJson<{
      value?: { name: string; category?: string; color?: string }[];
    }>(
      `${credentials.organizationUrl}/${encodeURIComponent(project.externalId)}/_apis/wit/workitemtypes/${encodeURIComponent(workItemType)}/states?api-version=${this.apiVersion}`,
      undefined,
      credentials,
    );
    return result.value ?? [];
  }

  /** Scheduling fields differ between processes (Agile/CMMI/Basic have Original Estimate, Scrum does not). */
  async typeFields(
    projectExternalId: string,
    workItemType: string,
    credentials: AzureDevOpsCredentials,
    fresh = false,
  ) {
    const key = `${projectExternalId}:${workItemType.toLowerCase()}`;
    const cached = this.typeFieldCache.get(key);
    if (!fresh && cached && Date.now() - cached.loadedAt < CACHE_TTL_MS)
      return cached.value;
    const result = await this.integration.requestJson<{
      value: { referenceName: string }[];
    }>(
      `${credentials.organizationUrl}/${encodeURIComponent(projectExternalId)}/_apis/wit/workitemtypes/${encodeURIComponent(workItemType)}/fields?api-version=${this.apiVersion}`,
      undefined,
      credentials,
    );
    const value = new Set(result.value.map((field) => field.referenceName));
    this.typeFieldCache.set(key, { value, loadedAt: Date.now() });
    return value;
  }

  /**
   * Iteration to move a Task to after its allocation changed quarter, or null to leave it.
   * A Task already in the quarter (its node, a child node, or a sprint whose dates overlap the
   * quarter) stays where the team put it; only a Task in the project root or in another period moves.
   */
  async iterationAfterQuarterMove(
    projectExternalId: string,
    quarterKey: string,
    currentValue: unknown,
    credentials: AzureDevOpsCredentials,
  ) {
    const target = await this.quarterIterationPath(
      projectExternalId,
      quarterKey,
      credentials,
    );
    const current = typeof currentValue === 'string' ? currentValue : '';
    if (!target) return null;
    const normalized = (path: string) => path.toLowerCase();
    if (
      normalized(current) === normalized(target) ||
      normalized(current).startsWith(`${normalized(target)}\\`)
    )
      return null;
    if (!current.includes('\\')) return target;
    const match = /^(\d{4})-Q([1-4])$/.exec(quarterKey);
    const root = this.iterationCache.get(projectExternalId)?.value;
    if (!match || !root) return null;
    const nodes: IterationNode[] = [];
    const visit = (node: IterationNode) => {
      nodes.push(node);
      node.children?.forEach(visit);
    };
    root.children?.forEach(visit);
    const node = nodes.find(
      (entry) =>
        entry.path &&
        normalized(
          entry.path.replace(/^\\/, '').replace(/\\Iteration(?=\\|$)/, ''),
        ) === normalized(current),
    );
    const start = node?.attributes?.startDate;
    const finish = node?.attributes?.finishDate;
    // Without dates we cannot tell whether a sprint belongs to the quarter, so it is left alone.
    if (!start || !finish) return null;
    const year = Number(match[1]);
    const quarter = Number(match[2]);
    const quarterStart = Date.UTC(year, (quarter - 1) * 3, 1);
    const quarterEnd = Date.UTC(year, quarter * 3, 0, 23, 59, 59);
    const overlaps =
      Date.parse(start) <= quarterEnd && Date.parse(finish) >= quarterStart;
    return overlaps ? null : target;
  }

  /**
   * The quarter's iteration for the plan filter, by the same rule Task write-back uses (`iterationPath`), and
   * every iteration that makes up the quarter (`iterationPaths`: the named one, else its sprints).
   * Empty when the integration is off or Azure cannot answer: the plan then shows every card.
   */
  async findQuarterIteration(
    projectId: string,
    quarterKey: string,
  ): Promise<{
    iterationPath: string | null;
    iterationPaths: string[];
    scoped: boolean;
  }> {
    if (typeof quarterKey !== 'string' || !/^\d{4}-Q[1-4]$/.test(quarterKey)) {
      throw new BadRequestException('Quarter must use YYYY-Qn format');
    }
    const project = await this.prisma.roadmapProject.findUnique({
      where: { id: projectId },
      select: { externalId: true },
    });
    if (!project) throw new NotFoundException('Roadmap project was not found');
    try {
      if (!(await this.integration.getPublicSettings()).configured)
        return { iterationPath: null, iterationPaths: [], scoped: false };
      const credentials = await this.integration.getCredentials();
      return await this.quarterIterations(
        project.externalId,
        quarterKey,
        credentials,
      );
    } catch (error) {
      this.logger.warn(
        `Quarter iteration lookup failed for project ${projectId}: ${azureErrorMessage(error)}`,
      );
      return { iterationPath: null, iterationPaths: [], scoped: false };
    }
  }

  /** Finds the iteration for a `YYYY-Qn` quarter: by name first, then the narrowest one spanning the quarter. */
  async quarterIterationPath(
    projectExternalId: string,
    quarterKey: string,
    credentials: AzureDevOpsCredentials,
    fresh = false,
  ) {
    const choice = await this.quarterIterationChoice(
      projectExternalId,
      quarterKey,
      credentials,
      fresh,
    );
    return choice.named ?? choice.spanning;
  }

  /**
   * Every sprint that belongs to a `YYYY-Qn` quarter. Teams that plan in monthly or two-week sprints have no
   * iteration named after the quarter, so a sprint belongs to the quarter its dates fall into (by their midpoint).
   * A sprint without dates is placed by a year and month in its name ("Sprint 26_10", "2026-10").
   * Anything longer than a quarter is a container (a year, a release), not a sprint.
   */
  async quarterSprintPaths(
    projectExternalId: string,
    quarterKey: string,
    credentials: AzureDevOpsCredentials,
    fresh = false,
  ): Promise<string[]> {
    const match = /^(\d{4})-Q([1-4])$/.exec(quarterKey);
    if (!match) return [];
    const nodes = await this.iterationNodes(
      projectExternalId,
      credentials,
      fresh,
    );
    return nodes
      ? sprintNodesOfQuarter(nodes, Number(match[1]), Number(match[2]))
          .map(workItemIterationPath)
          .filter((path): path is string => Boolean(path))
      : [];
  }

  /**
   * The iterations that make up a quarter for the plan: the one named after it; otherwise its sprints;
   * otherwise a single iteration spanning it. `named` and `spanning` are what Task write-back uses.
   */
  async quarterIterations(
    projectExternalId: string,
    quarterKey: string,
    credentials: AzureDevOpsCredentials,
  ) {
    const choice = await this.quarterIterationChoice(
      projectExternalId,
      quarterKey,
      credentials,
    );
    const sprints = await this.quarterSprintPaths(
      projectExternalId,
      quarterKey,
      credentials,
    );
    const iterationPaths = choice.named
      ? [choice.named]
      : sprints.length
        ? sprints
        : choice.spanning
          ? [choice.spanning]
          : [];
    // A project that plans by iteration has cards in other quarters' sprints, so a quarter with none of its own is
    // empty rather than "unknown": its plan must not fall back to every card's estimate.
    const nodes = iterationPaths.length
      ? null
      : await this.iterationNodes(projectExternalId, credentials, false);
    return {
      iterationPath: choice.named ?? choice.spanning,
      iterationPaths,
      scoped: iterationPaths.length > 0 || Boolean(nodes && usesIterationScheme(nodes)),
    };
  }

  /** The classification tree of a project's iterations, flattened and cached; null when Azure cannot answer. */
  private async iterationNodes(
    projectExternalId: string,
    credentials: AzureDevOpsCredentials,
    fresh: boolean,
  ) {
    let cached = this.iterationCache.get(projectExternalId);
    if (fresh || !cached || Date.now() - cached.loadedAt >= CACHE_TTL_MS) {
      const root = await this.integration
        .requestJson<IterationNode>(
          `${credentials.organizationUrl}/${encodeURIComponent(projectExternalId)}/_apis/wit/classificationnodes/Iterations?$depth=10&api-version=${this.apiVersion}`,
          undefined,
          credentials,
        )
        .catch(() => null);
      cached = { value: root, loadedAt: Date.now() };
      this.iterationCache.set(projectExternalId, cached);
    }
    if (!cached.value) return null;

    const nodes: IterationNode[] = [];
    const visit = (node: IterationNode) => {
      nodes.push(node);
      node.children?.forEach(visit);
    };
    cached.value.children?.forEach(visit);
    return nodes;
  }

  private async quarterIterationChoice(
    projectExternalId: string,
    quarterKey: string,
    credentials: AzureDevOpsCredentials,
    fresh = false,
  ): Promise<{ named: string | null; spanning: string | null }> {
    const match = /^(\d{4})-Q([1-4])$/.exec(quarterKey);
    if (!match) return { named: null, spanning: null };
    const year = Number(match[1]);
    const quarter = Number(match[2]);
    const quarterStart = Date.UTC(year, (quarter - 1) * 3, 1);
    const quarterEnd = Date.UTC(year, quarter * 3, 0);

    const nodes = await this.iterationNodes(
      projectExternalId,
      credentials,
      fresh,
    );
    if (!nodes) return { named: null, spanning: null };
    const namePattern = new RegExp(
      `(^|\\D)(${year}\\W*Q${quarter}|Q${quarter}\\W*${year})(\\D|$)`,
      'i',
    );
    const day = (value: string) => {
      const date = new Date(value);
      return Date.UTC(
        date.getUTCFullYear(),
        date.getUTCMonth(),
        date.getUTCDate(),
      );
    };
    const byName = nodes.find((node) =>
      namePattern.test(node.path ?? node.name),
    );
    const spanning = nodes
      .filter(
        (node) =>
          node.attributes?.startDate &&
          node.attributes.finishDate &&
          day(node.attributes.startDate) <= quarterStart &&
          day(node.attributes.finishDate) >= quarterEnd,
      )
      .sort(
        (left, right) =>
          day(left.attributes!.finishDate!) -
          day(left.attributes!.startDate!) -
          (day(right.attributes!.finishDate!) -
            day(right.attributes!.startDate!)),
      );
    return {
      named: byName ? workItemIterationPath(byName) : null,
      spanning: spanning[0] ? workItemIterationPath(spanning[0]) : null,
    };
  }
}

/** Classification paths look like "\Project\Iteration\2026\Q4"; work items use "Project\2026\Q4". */
function workItemIterationPath(node: IterationNode) {
  return node.path
    ? node.path.replace(/^\\/, '').replace(/\\Iteration(?=\\|$)/, '')
    : null;
}

const DAY_MS = 24 * 60 * 60 * 1000;
/** A quarter is at most 92 days; anything much longer is a container, not a sprint. */
const MAX_SPRINT_DAYS = 100;
/** "Sprint 26_10", "2026-10", "26.10": a year (two or four digits) and a month, never a bare number like "026". */
const SPRINT_MONTH_NAME = /(?:^|\D)(\d{4}|\d{2})\s*[_.\-/]\s*(0[1-9]|1[0-2])(?:\D|$)/;

/** A year with a quarter ("2026 Q4", "Q4-2026"): the quarter-named scheme `quarterIterationChoice` looks for. */
const QUARTER_NAME = /(^|\D)(\d{4}\W*Q[1-4]|Q[1-4]\W*\d{4})(\D|$)/i;

/** True when any iteration looks like a quarter or a sprint, i.e. the team plans by iteration. */
export function usesIterationScheme(nodes: IterationNode[]) {
  return nodes.some((node) => {
    if (QUARTER_NAME.test(node.path ?? node.name ?? '')) return true;
    const start = node.attributes?.startDate
      ? Date.parse(node.attributes.startDate)
      : NaN;
    const finish = node.attributes?.finishDate
      ? Date.parse(node.attributes.finishDate)
      : NaN;
    if (Number.isFinite(start) && Number.isFinite(finish))
      return finish >= start && finish - start <= MAX_SPRINT_DAYS * DAY_MS;
    return SPRINT_MONTH_NAME.test(node.name ?? '');
  });
}

/** The nodes that are sprints of the given quarter, see `quarterSprintPaths`. */
export function sprintNodesOfQuarter(
  nodes: IterationNode[],
  year: number,
  quarter: number,
) {
  const quarterStart = Date.UTC(year, (quarter - 1) * 3, 1);
  const quarterEnd = Date.UTC(year, quarter * 3, 1) - 1;
  return nodes.filter((node) => {
    const start = node.attributes?.startDate
      ? Date.parse(node.attributes.startDate)
      : NaN;
    const finish = node.attributes?.finishDate
      ? Date.parse(node.attributes.finishDate)
      : NaN;
    if (Number.isFinite(start) && Number.isFinite(finish)) {
      if (finish < start || finish - start > MAX_SPRINT_DAYS * DAY_MS)
        return false;
      const middle = start + (finish - start) / 2;
      return middle >= quarterStart && middle <= quarterEnd;
    }
    const named = SPRINT_MONTH_NAME.exec(node.name ?? '');
    if (!named) return false;
    const nameYear = named[1].length === 2 ? 2000 + Number(named[1]) : Number(named[1]);
    return (
      nameYear === year && Math.floor((Number(named[2]) - 1) / 3) + 1 === quarter
    );
  });
}
