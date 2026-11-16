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
   * The quarter's iteration for the plan filter, by the same rule Task write-back uses.
   * Null when the integration is off or Azure cannot answer: the plan then shows every card.
   */
  async findQuarterIteration(
    projectId: string,
    quarterKey: string,
  ): Promise<{ iterationPath: string | null }> {
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
        return { iterationPath: null };
      const credentials = await this.integration.getCredentials();
      return {
        iterationPath: await this.quarterIterationPath(
          project.externalId,
          quarterKey,
          credentials,
        ),
      };
    } catch (error) {
      this.logger.warn(
        `Quarter iteration lookup failed for project ${projectId}: ${azureErrorMessage(error)}`,
      );
      return { iterationPath: null };
    }
  }

  /** Finds the iteration for a `YYYY-Qn` quarter: by name first, then the narrowest one spanning the quarter. */
  async quarterIterationPath(
    projectExternalId: string,
    quarterKey: string,
    credentials: AzureDevOpsCredentials,
    fresh = false,
  ) {
    const match = /^(\d{4})-Q([1-4])$/.exec(quarterKey);
    if (!match) return null;
    const year = Number(match[1]);
    const quarter = Number(match[2]);
    const quarterStart = Date.UTC(year, (quarter - 1) * 3, 1);
    const quarterEnd = Date.UTC(year, quarter * 3, 0);

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
    const node = byName ?? spanning[0];
    // Classification paths look like "\Project\Iteration\2026\Q4"; work items use "Project\2026\Q4".
    return node?.path
      ? node.path.replace(/^\\/, '').replace(/\\Iteration(?=\\|$)/, '')
      : null;
  }
}
