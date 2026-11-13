import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/infrastructure/prisma/prisma.service';
import { AzureDevOpsCredentials, AzureDevOpsHttpError, RoadmapIntegrationService } from './roadmap-integration.service';

type ProjectDetails = {
  id: string;
  name: string;
  url?: string;
  capabilities?: { processTemplate?: { templateTypeId?: string } };
};

type FormControl = { id: string; label?: string; visible?: boolean; isContribution?: boolean };
type FormGroup = { visible?: boolean; controls?: FormControl[] };
type FormPage = { label?: string; visible?: boolean; sections?: { groups?: FormGroup[] }[] };
type ProcessWorkItemType = { isDisabled?: boolean; layout?: { pages?: FormPage[] } };
type ProcessDetails = { typeId: string; projects?: { id: string }[] };
type WorkItemField = { name: string; referenceName: string; type: string; isDeleted?: boolean };
type AzureRoleField = { name: string; referenceName: string };

const ESTIMATE_SUFFIX = /\s+Estimate$/i;
const NUMERIC_FIELDS = new Set(['integer', 'double', 'picklistInteger', 'picklistDouble']);

export function rolesFromEstimatePages(types: ProcessWorkItemType[], fields: WorkItemField[]): AzureRoleField[] {
  const fieldByReference = new Map(fields.map((field) => [field.referenceName.toLowerCase(), field]));
  const roles = new Map<string, AzureRoleField>();

  for (const type of types) {
    if (type.isDisabled) continue;
    for (const page of type.layout?.pages ?? []) {
      if (page.visible === false || page.label?.trim().toLowerCase() !== 'roles estimate') continue;
      const groups = (page.sections ?? []).flatMap((section) => section.groups ?? []);
      for (const group of groups) {
        if (group.visible === false) continue;
        for (const control of group.controls ?? []) {
          if (control.visible === false || control.isContribution) continue;
          const field = fieldByReference.get(control.id.toLowerCase());
          if (!field || field.isDeleted || !NUMERIC_FIELDS.has(field.type) || roles.has(field.referenceName)) continue;
          const label = [control.label, field.name].find((value) => value && ESTIMATE_SUFFIX.test(value.trim()));
          const name = label?.trim().replace(ESTIMATE_SUFFIX, '').trim();
          if (name) roles.set(field.referenceName, { name, referenceName: field.referenceName });
        }
      }
    }
  }

  return [...roles.values()];
}

@Injectable()
export class RoadmapAzureCatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly integration: RoadmapIntegrationService,
  ) {}

  async syncProject(externalId: string, credentials: AzureDevOpsCredentials) {
    const organizationUrl = credentials.organizationUrl;
    const project = await this.integration.requestJson<ProjectDetails>(
      `${organizationUrl}/_apis/projects/${encodeURIComponent(externalId)}?includeCapabilities=true&api-version=7.1`,
      undefined,
      credentials,
    );
    const { roles, roleSyncWarning } = await this.discoverRoles(project, credentials);

    // Serialize role reconciliation for concurrent imports of the same project.
    return this.prisma.$transaction(async (tx) => {
      const projectData = { name: project.name, url: project.url ?? null };
      const saved = await tx.roadmapProject.upsert({
        where: { externalId: project.id },
        create: { externalId: project.id, ...projectData },
        update: projectData,
      });
      if (!roles.length) return { projectId: saved.id, importedRoles: 0, roleSyncWarning };

      const savedRoles = await tx.roadmapRole.findMany({
        where: { projectId: saved.id },
        select: { id: true, name: true, isMock: true, azureEstimateField: true },
        orderBy: { name: 'asc' },
      });
      const linkedFields = new Set(savedRoles.map((role) => role.azureEstimateField));
      const rolesByName = new Map(savedRoles.map((role) => [role.name.toLowerCase(), role]));
      const usedNames = new Set(rolesByName.keys());

      for (const { name, referenceName } of roles) {
        if (linkedFields.has(referenceName)) continue;
        const existing = rolesByName.get(name.toLowerCase());
        if (existing && !existing.azureEstimateField && !existing.isMock) {
          await tx.roadmapRole.update({ where: { id: existing.id }, data: { azureEstimateField: referenceName } });
          existing.azureEstimateField = referenceName;
          continue;
        }
        const roleName = availableRoleName(name, usedNames);
        usedNames.add(roleName.toLowerCase());
        await tx.roadmapRole.create({
          data: { projectId: saved.id, name: roleName, azureEstimateField: referenceName },
        });
      }

      return { projectId: saved.id, importedRoles: roles.length, roleSyncWarning };
    });
  }

  private async discoverRoles(project: ProjectDetails, credentials: AzureDevOpsCredentials) {
    const organizationUrl = credentials.organizationUrl;
    try {
      const processId = project.capabilities?.processTemplate?.templateTypeId
        || await this.findProjectProcess(project.id, credentials);
      if (!processId) {
        return { roles: [], roleSyncWarning: 'Azure DevOps не указал, какой процесс использует проект. Список ролей не обновлён.' };
      }
      const [types, fields] = await Promise.all([
        this.integration.requestJson<{ value: ProcessWorkItemType[] }>(
          `${organizationUrl}/_apis/work/processes/${encodeURIComponent(processId)}/workitemtypes?$expand=layout&api-version=7.1`,
          undefined,
          credentials,
        ),
        this.integration.requestJson<{ value: WorkItemField[] }>(
          `${organizationUrl}/${encodeURIComponent(project.id)}/_apis/wit/fields?api-version=7.1`,
          undefined,
          credentials,
        ),
      ]);
      if (!types.value.some((type) => !type.isDisabled && Array.isArray(type.layout?.pages))) {
        return { roles: [], roleSyncWarning: 'Azure DevOps не вернул формы задач проекта. Список ролей не обновлён.' };
      }
      const roles = rolesFromEstimatePages(types.value, fields.value);
      return {
        roles,
        roleSyncWarning: roles.length ? undefined : 'В формах задач проекта не найдены поля ролей на вкладке Roles Estimate.',
      };
    } catch (error) {
      const forbidden = error instanceof AzureDevOpsHttpError && [401, 403].includes(error.httpStatus);
      return {
        roles: [],
        roleSyncWarning: forbidden
          ? 'Azure DevOps не дал доступ к вкладке Roles Estimate. Проверьте права токена на чтение рабочих элементов.'
          : 'Не удалось прочитать вкладку Roles Estimate. Попробуйте загрузить роли ещё раз.',
      };
    }
  }

  private async findProjectProcess(projectId: string, credentials: AzureDevOpsCredentials) {
    const processes = await this.integration.requestJson<{ value: ProcessDetails[] }>(
      `${credentials.organizationUrl}/_apis/work/processes?$expand=projects&api-version=7.1`,
      undefined,
      credentials,
    );
    return processes.value.find((process) => process.projects?.some(
      (project) => project.id.toLowerCase() === projectId.toLowerCase(),
    ))?.typeId;
  }
}

function availableRoleName(name: string, usedNames: Set<string>): string {
  let candidate = name.slice(0, 100);
  for (let number = 2; usedNames.has(candidate.toLowerCase()); number++) {
    const suffix = ` (${number})`;
    candidate = name.slice(0, 100 - suffix.length).trimEnd() + suffix;
  }
  return candidate;
}
