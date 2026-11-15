import type {
  AzureProject, RoadmapAllocation, RoadmapIntegrationSettings, RoadmapPeriod,
  RoadmapPerson, RoadmapProjectPlan, RoadmapRole, RoadmapWriteBackSettings,
  RoadmapRoleAssignment, RoadmapRoleTemplate,
  RoadmapAzureField, RoadmapAzureState, RoadmapWorkItemType,
} from './roadmapApi';
import { buildRoadmapPortfolio, getRoadmapSummary, rebalanceAllocations, type RoadmapPortfolioInput, type SyncSettingsV2 } from '@tracker/shared';

export const DEMO_BLOB_PATH = 'roadmap/demo-state-v1.json';
const PROJECT_ID = 'demo-roadmap-project';
const AZURE_PROJECT_ID = 'demo-azure-project';
// Allocations saved before quarterly planning belong to this quarter.
const LEGACY_QUARTER_KEY = '2026-Q4';
type DemoPerson = RoadmapPerson & { externalId: string };
const DEMO_WRITE_BACK: RoadmapWriteBackSettings = {
  mode: 'off', workItemType: 'Task', titleTemplate: '{role}: {title} ({quarter})', tagsTemplate: 'Roadmap; Roadmap {quarterKey}; {role}',
  fields: { assignedTo: true, originalEstimate: true, remainingWork: true, iteration: true, areaPath: true, description: true },
  remainingWorkPolicy: 'recalculate', projectIds: null,
};
const DEMO_SYNC_SETTINGS: SyncSettingsV2 = {
  version: 2, mode: 'off', projectIds: null, workItemType: 'Task',
  titleTemplate: '{role}: {title} ({quarter})', tagsTemplate: 'Roadmap; Roadmap {quarterKey}; {role}',
  writeRules: [], readRules: [], fact: { field: 'Microsoft.VSTS.Scheduling.CompletedWork', scope: 'roadmapTasks', unlinkedTasks: 'featureOnly' },
  roleFields: [], writeFeatureAggregates: false, conflictPolicy: 'overwrite', removalPolicy: { action: 'keep' }, pushPermission: 'planners',
};

export type DemoState = {
  version: 1;
  organizationUrl: string;
  projects: AzureProject[];
  people: DemoPerson[];
  roles: RoadmapRole[];
  roleCatalog: RoadmapRoleTemplate[];
  plan: RoadmapProjectPlan;
};

const peopleSeed: DemoPerson[] = [
  { id: 'person-anna', externalId: 'mock:anna-smirnova', name: 'Анна Смирнова', email: 'anna.smirnova@example.test', isActive: true, isMock: true },
  { id: 'person-ivan', externalId: 'mock:ivan-petrov', name: 'Иван Петров', email: 'ivan.petrov@example.test', isActive: true, isMock: true },
  { id: 'person-maria', externalId: 'mock:maria-volkova', name: 'Мария Волкова', email: 'maria.volkova@example.test', isActive: true, isMock: true },
  { id: 'person-dmitry', externalId: 'mock:dmitry-sokolov', name: 'Дмитрий Соколов', email: 'dmitry.sokolov@example.test', isActive: true, isMock: true },
  { id: 'person-elena', externalId: 'mock:elena-orlova', name: 'Елена Орлова', email: 'elena.orlova@example.test', isActive: true, isMock: true },
];

const roleSeed = [
  { id: 'role-backend', name: 'Backend', color: '#6366f1', members: ['mock:ivan-petrov', 'mock:dmitry-sokolov'], defaultPersonExternalId: 'mock:ivan-petrov' },
  { id: 'role-frontend', name: 'Frontend', color: '#0ea5e9', members: ['mock:anna-smirnova', 'mock:ivan-petrov'], defaultPersonExternalId: 'mock:anna-smirnova' },
  { id: 'role-qa', name: 'QA', color: '#10b981', members: ['mock:maria-volkova', 'mock:elena-orlova'], defaultPersonExternalId: 'mock:maria-volkova' },
  { id: 'role-analyst', name: 'Аналитика', color: '#f59e0b', members: ['mock:anna-smirnova', 'mock:elena-orlova'], defaultPersonExternalId: 'mock:elena-orlova' },
];

const catalogSeed = [
  ['template-backend', 'Backend', '#6366f1'], ['template-frontend', 'Frontend', '#0ea5e9'],
  ['template-qa', 'QA', '#10b981'], ['template-analyst', 'Аналитика', '#f59e0b'],
  ['template-design', 'Дизайн', '#ec4899'], ['template-devops', 'DevOps', '#8b5cf6'],
].map(([id, name, color]) => ({ id, name, color, isMock: true })) as DemoState['roleCatalog'];

function monthPeriod(monthKey: string, hours: number): RoadmapPeriod {
  const [year, month] = monthKey.split('-').map(Number);
  const startsAt = `${monthKey}-01`;
  const endsAt = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  const label = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, 1)));
  return { id: `period-${monthKey}`, monthKey, label, startsAt, endsAt, hours };
}

function createRole(role: typeof roleSeed[number]): RoadmapRole {
  const defaultPerson = peopleSeed.find((person) => person.externalId === role.defaultPersonExternalId);
  return {
    id: role.id, projectId: PROJECT_ID, name: role.name, color: role.color, isMock: true,
    defaultPersonExternalId: role.defaultPersonExternalId, defaultPersonName: defaultPerson?.name ?? null,
    defaultPersonEmail: defaultPerson?.email ?? null, defaultPersonIsMock: true,
    members: role.members.map((externalId) => {
      const person = peopleSeed.find((candidate) => candidate.externalId === externalId)!;
      return { personExternalId: person.externalId, personName: person.name, personEmail: person.email,
        personIsActive: true, personIsMock: true, allocationPercent: 100 / role.members.length };
    }),
  };
}

export function createInitialDemoState(): DemoState {
  const roles = roleSeed.map(createRole);
  const itemSeeds: [string, string | null, string, string, string][] = [
    ['DEMO-100', null, 'Epic', 'Портал самообслуживания', 'Active'],
    ['DEMO-110', 'DEMO-100', 'Feature', 'Каталог сервисов и база знаний', 'In Progress'],
    ['DEMO-120', 'DEMO-100', 'Feature', 'Заявки и маршрут согласования', 'Active'],
    ['DEMO-130', 'DEMO-100', 'Feature', 'Уведомления и эскалации', 'New'],
    ['DEMO-200', null, 'Epic', 'Планирование ресурсов', 'Active'],
    ['DEMO-210', 'DEMO-200', 'Feature', 'Загрузка команды по месяцам', 'In Progress'],
    ['DEMO-220', 'DEMO-200', 'Feature', 'Отчёты по срокам и SLA', 'New'],
    ['DEMO-300', null, 'Epic', 'Поиск и автоматизация', 'New'],
    ['DEMO-310', 'DEMO-300', 'Feature', 'Поиск по заявкам', 'Active'],
  ];
  const workItems: RoadmapProjectPlan['workItems'] = itemSeeds.map(([externalId, parentExternalId, type, title, state]) => ({
    id: `item-${externalId}`, externalId, parentExternalId, type, title, state, url: null,
    actualHours: null, azureCustomFields: null, allocations: [],
  }));

  const person = (externalId: string) => peopleSeed.find((item) => item.externalId === externalId)!;
  const role = (id: string) => roles.find((item) => item.id === id)!;
  const addAllocation = (itemKey: string, roleId: string, personId: string, estimatedHours: number, months: Record<string, number>) => {
    const item = workItems.find((candidate) => candidate.externalId === itemKey)!;
    const member = person(personId);
    const assignedRole = role(roleId);
    const allocation: RoadmapAllocation = {
      id: `allocation-${itemKey}-${roleId}-${personId}`, roleId, personExternalId: personId,
      personName: member.name, personEmail: member.email, quarterKey: LEGACY_QUARTER_KEY, estimatedHours,
      role: { id: assignedRole.id, projectId: PROJECT_ID, name: assignedRole.name, color: assignedRole.color, isMock: true },
      periods: Object.entries(months).map(([key, hours]) => monthPeriod(key, hours)),
    };
    item.allocations.push(allocation);
  };

  addAllocation('DEMO-110', 'role-frontend', 'mock:anna-smirnova', 80, { '2026-07': 20, '2026-08': 24, '2026-09': 16, '2026-10': 10, '2026-11': 10 });
  addAllocation('DEMO-110', 'role-backend', 'mock:ivan-petrov', 64, { '2026-07': 16, '2026-08': 16, '2026-09': 12, '2026-10': 8, '2026-11': 8, '2026-12': 4 });
  addAllocation('DEMO-120', 'role-backend', 'mock:dmitry-sokolov', 96, { '2026-07': 24, '2026-08': 24, '2026-09': 16, '2026-10': 12, '2026-11': 12 });
  addAllocation('DEMO-120', 'role-analyst', 'mock:elena-orlova', 40, { '2026-07': 12, '2026-08': 12, '2026-09': 8, '2026-10': 4 });
  addAllocation('DEMO-120', 'role-qa', 'mock:maria-volkova', 32, { '2026-08': 8, '2026-09': 8, '2026-10': 8 });
  addAllocation('DEMO-130', 'role-backend', 'mock:ivan-petrov', 48, { '2026-09': 12, '2026-10': 12, '2026-11': 12 });
  addAllocation('DEMO-130', 'role-frontend', 'mock:anna-smirnova', 24, { '2026-09': 8, '2026-10': 8 });
  addAllocation('DEMO-210', 'role-analyst', 'mock:anna-smirnova', 56, { '2026-07': 16, '2026-08': 16, '2026-09': 8, '2026-10': 8, '2026-11': 8 });
  addAllocation('DEMO-210', 'role-frontend', 'mock:ivan-petrov', 48, { '2026-08': 12, '2026-09': 12, '2026-10': 12, '2026-11': 12 });
  addAllocation('DEMO-220', 'role-analyst', 'mock:elena-orlova', 32, { '2026-09': 8, '2026-10': 8, '2026-11': 8, '2026-12': 8 });
  addAllocation('DEMO-220', 'role-qa', 'mock:maria-volkova', 40, { '2026-10': 12, '2026-11': 12, '2026-12': 8 });
  addAllocation('DEMO-310', 'role-backend', 'mock:dmitry-sokolov', 72, { '2026-09': 16, '2026-10': 16, '2026-11': 16, '2026-12': 8 });
  addAllocation('DEMO-310', 'role-qa', 'mock:elena-orlova', 24, { '2026-10': 8, '2026-11': 8 });

  const plan: RoadmapProjectPlan = {
    id: PROJECT_ID, externalId: AZURE_PROJECT_ID, name: 'Wayo — Roadmap demo', url: null,
    syncedAt: new Date().toISOString(), workItems, roles,
  };
  return {
    version: 1, organizationUrl: '',
    projects: [{ id: AZURE_PROJECT_ID, name: 'Wayo — Roadmap demo', imported: true, roadmapId: PROJECT_ID }],
    people: peopleSeed.map((item) => ({ ...item, roles: [] })), roles, roleCatalog: clone(catalogSeed), plan,
  };
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function rolesOf(state: DemoState) { return state.roles.filter((role) => role.projectId === PROJECT_ID); }
function roleOf(state: DemoState, id: string) {
  const role = rolesOf(state).find((item) => item.id === id);
  if (!role) throw new Error('Роль демо-проекта не найдена. Обновите страницу и повторите действие.');
  return role;
}
function normalizePersonIds(state: DemoState, ids: string[]) {
  return ids.map((id) => state.people.find((person) => person.id === id || person.externalId === id)?.externalId ?? id);
}
function equalMemberShares(ids: string[]) {
  if (!ids.length) return new Map<string, number>();
  const base = Math.floor(10_000 / ids.length);
  const remainder = 10_000 % ids.length;
  return new Map(ids.map((id, index) => [id, (base + Number(index < remainder)) / 100]));
}
function applyRoleAssignment(state: DemoState, role: RoadmapRole, assignment: RoadmapRoleAssignment) {
  if (assignment.memberAllocations !== undefined) {
    const allocations = assignment.memberAllocations.map((member) => ({
      ...member, personExternalId: normalizePersonIds(state, [member.personExternalId])[0],
    }));
    const ids = new Set(allocations.map((member) => member.personExternalId));
    if (ids.size !== allocations.length) throw new Error('Сотрудник не может быть указан дважды.');
    if (allocations.some(({ allocationPercent }) => !Number.isFinite(allocationPercent) || allocationPercent < 0 || allocationPercent > 100
      || Math.abs(allocationPercent * 100 - Math.round(allocationPercent * 100)) > 1e-8)) {
      throw new Error('Укажите процент участия от 0 до 100 с точностью до двух знаков.');
    }
    if (allocations.length && allocations.reduce((sum, member) => sum + Math.round(member.allocationPercent * 100), 0) !== 10_000) {
      throw new Error('Сумма процентов участия должна быть равна 100%.');
    }
    const members = allocations.map(({ personExternalId, allocationPercent }) => {
      const person = state.people.find((item) => item.externalId === personExternalId);
      const existing = role.members?.some((member) => member.personExternalId === personExternalId);
      if (!person || (person.isActive === false && !existing)) throw new Error('Выбранный сотрудник недоступен.');
      return {
        personExternalId, allocationPercent, personName: person.name, personEmail: person.email,
        personIsActive: person.isActive ?? true, personIsMock: person.isMock,
      };
    });
    role.members = members;
    role.defaultPersonExternalId = null;
    role.defaultPersonName = null;
    role.defaultPersonEmail = null;
    role.defaultPersonIsMock = false;
    return;
  }
  if (assignment.personExternalIds === undefined && assignment.personExternalId === undefined) return;
  const members = new Set(normalizePersonIds(state,
    assignment.personExternalIds ?? role.members?.map((member) => member.personExternalId) ?? [],
  ));
  const defaultId = assignment.personExternalId;
  const person = defaultId === undefined
    ? state.people.find((item) => item.externalId === role.defaultPersonExternalId && members.has(item.externalId))
    : state.people.find((item) => defaultId && item.isActive && (item.id === defaultId || item.externalId === defaultId));
  if (defaultId && !person) throw new Error('Выбранный сотрудник недоступен.');
  if (person) members.add(person.externalId);
  const previousMembers = role.members ?? [];
  if ([...members].some((id) => !state.people.some((item) => item.externalId === id
    && (item.isActive !== false || previousMembers.some((member) => member.personExternalId === id))))) {
    throw new Error('Выбранный сотрудник недоступен.');
  }
  const membershipChanged = previousMembers.length !== members.size || previousMembers.some((member) => !members.has(member.personExternalId));
  const equalShares = equalMemberShares([...members]);
  role.members = state.people.filter((item) => members.has(item.externalId)).map((item) => ({
    personExternalId: item.externalId, personName: item.name, personEmail: item.email,
    personIsActive: item.isActive ?? true, personIsMock: item.isMock,
    allocationPercent: (!membershipChanged ? previousMembers.find((member) => member.personExternalId === item.externalId)?.allocationPercent : undefined)
      ?? equalShares.get(item.externalId) ?? 0,
  }));
  role.defaultPersonExternalId = person?.externalId ?? null;
  role.defaultPersonName = person?.name ?? null;
  role.defaultPersonEmail = person?.email ?? null;
  role.defaultPersonIsMock = person?.isMock ?? false;
}
function peopleWithRoles(state: DemoState): RoadmapPerson[] {
  return state.people.map((person) => ({
    ...person,
    id: person.externalId,
    roles: rolesOf(state).filter((role) => role.members?.some((member) => member.personExternalId === person.externalId))
      .map((role) => ({ id: role.id, name: role.name, color: role.color, projectName: state.plan.name })),
  }));
}
function planOf(state: DemoState): RoadmapProjectPlan {
  return { ...state.plan, roles: clone(rolesOf(state)), workItems: state.plan.workItems.map((item) => ({
    ...item, allocations: item.type.toLowerCase() === 'epic' ? [] : item.allocations.map((allocation) => ({
      ...allocation, quarterKey: allocation.quarterKey ?? LEGACY_QUARTER_KEY, role: clone(roleOf(state, allocation.roleId)),
    })),
  })) };
}
function integrationSettings(state: DemoState): RoadmapIntegrationSettings {
  return { provider: 'azure-devops', organizationUrl: state.organizationUrl, configured: false,
    patConfigured: false, source: 'unconfigured', encryptionKeyConfigured: false,
    writeBackEnabled: false, writeBack: DEMO_WRITE_BACK, webhookConfigured: false };
}
function findWorkItem(state: DemoState, id: string) {
  const item = state.plan.workItems.find((candidate) => candidate.id === id || candidate.externalId === id);
  if (!item) throw new Error('Демо-задача не найдена. Обновите страницу и повторите действие.');
  return item;
}

function assertAssignableWorkItem(item: { type: string }) {
  if (item.type.toLowerCase() === 'epic') throw new Error('На эпики нельзя назначать исполнителей.');
}

type Operation = { method: string; args: unknown[] };
export async function runDemoOperation(state: DemoState, operation: Operation): Promise<unknown> {
  // Arguments are narrowed by each operation branch below.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [arg0, arg1, arg2] = operation.args as [any, any, any];
  switch (operation.method) {
    case 'connection': return { provider: 'azure-devops', configured: false, organizationUrl: '' };
    case 'integrationSettings': return integrationSettings(state);
    case 'saveIntegrationSettings': state.organizationUrl = arg0.organizationUrl; return integrationSettings(state);
    case 'testIntegrationConnection': throw new Error('Подключение Azure DevOps недоступно в демо. Данные проекта уже загружены.');
    case 'writeBackOverview': return { settings: DEMO_WRITE_BACK, projects: [], errors: [] };
    case 'syncSettingsV2': return clone(DEMO_SYNC_SETTINGS);
    case 'workItemTypes': return [] as RoadmapWorkItemType[];
    case 'azureFields': return [] as RoadmapAzureField[];
    case 'azureStates': return [] as RoadmapAzureState[];
    case 'saveWriteBackSettings': case 'saveSyncSettingsV2': case 'checkWriteBack': case 'webhookSecret': case 'rotateWebhookSecret':
    case 'previewAzurePush': case 'pushProjectToAzure': case 'pushAllocationToAzure':
      throw new Error('Запись плана в Azure DevOps недоступна в демо.');
    case 'projects': return { data: clone(state.projects), source: 'cache' };
    case 'projectSummaries': {
      const input: RoadmapPortfolioInput = arg0;
      const entries = input.projectIds.includes(PROJECT_ID)
        ? [{ id: PROJECT_ID, summary: getRoadmapSummary(planOf(state), input) }]
        : [];
      return buildRoadmapPortfolio(entries, input);
    }
    case 'syncProject': return { projectId: PROJECT_ID, importedWorkItems: state.plan.workItems.length };
    case 'plan': return planOf(state);
    case 'people': return { data: peopleWithRoles(state) };
    case 'roles': return clone(rolesOf(state));
    case 'adminRoles': return clone(arg0 ? state.roles.filter((role) => role.projectId === arg0) : state.roles);
    case 'adminPeople': return peopleWithRoles(state);
    case 'syncAdminPeople': return { synced: state.people.length, ignored: 0 };
    case 'roleCatalog': return clone(state.roleCatalog);
    case 'createRoleTemplate': {
      const role = { id: `template-${crypto.randomUUID()}`, name: String(arg0), color: arg1 ?? '#6366f1', isMock: true };
      if (arg2?.projectId) {
        const projectRole = { ...role, id: `role-${crypto.randomUUID()}`, projectId: arg2.projectId };
        applyRoleAssignment(state, projectRole, arg2);
        state.roles.push(projectRole);
        state.plan.roles = rolesOf(state);
      }
      state.roleCatalog.push(role); return clone(role);
    }
    case 'addRoleFromCatalog': {
      const template = state.roleCatalog.find((item) => item.id === arg1);
      if (!template) throw new Error('Шаблон роли не найден.');
      const existing = rolesOf(state).find((item) => item.name === template.name);
      if (existing) return clone(existing);
      const role: RoadmapRole = { ...template, id: `role-${crypto.randomUUID()}`, projectId: PROJECT_ID, members: [] };
      if (arg2) applyRoleAssignment(state, role, arg2);
      state.roles.push(role); state.plan.roles = rolesOf(state); return clone(role);
    }
    case 'createRole': {
      const role: RoadmapRole = { id: `role-${crypto.randomUUID()}`, projectId: PROJECT_ID,
        name: String(arg1), color: arg2 ?? '#6366f1', isMock: true, members: [] };
      state.roles.push(role); state.plan.roles = rolesOf(state); return clone(role);
    }
    case 'updateRole': {
      const role = roleOf(state, arg0);
      const { name, color, ...assignment } = arg1;
      applyRoleAssignment(state, role, assignment);
      if (name !== undefined) role.name = name;
      if (color !== undefined) role.color = color;
      return clone(role);
    }
    case 'setRoleMembers': {
      const role = roleOf(state, arg0);
      applyRoleAssignment(state, role, { personExternalIds: arg1 });
      return clone(role);
    }
    case 'setRoleDefaultPerson': {
      const role = roleOf(state, arg0);
      applyRoleAssignment(state, role, { personExternalId: arg1 });
      return clone(role);
    }
    case 'deleteRole': {
      const removed = state.roles.find((item) => item.id === arg0);
      if (removed && !state.roleCatalog.some((item) => item.name === removed.name)) {
        state.roleCatalog.push({ id: `template-${crypto.randomUUID()}`, name: removed.name, color: removed.color, isMock: removed.isMock });
      }
      state.roles = state.roles.filter((item) => item.id !== arg0);
      state.plan.workItems.forEach((item) => { item.allocations = item.allocations.filter((allocation) => allocation.roleId !== arg0); });
      state.plan.roles = rolesOf(state); return { deleted: true };
    }
    case 'saveAllocation': {
      const input = arg0 as { allocationId?: string; workItemId: string; roleId: string; personExternalId: string; personName: string; personEmail?: string | null; quarterKey: string; estimatedHours: number; periods: Omit<RoadmapPeriod, 'id'>[] };
      const item = findWorkItem(state, input.workItemId);
      assertAssignableWorkItem(item);
      const externalId = normalizePersonIds(state, [input.personExternalId])[0];
      const person = state.people.find((candidate) => candidate.externalId === externalId);
      const index = item.allocations.findIndex((allocation) => allocation.id === input.allocationId ||
        (allocation.roleId === input.roleId && allocation.personExternalId === externalId
          && (allocation.quarterKey ?? LEGACY_QUARTER_KEY) === input.quarterKey));
      const previous = index >= 0 ? item.allocations[index] : undefined;
      const allocation: RoadmapAllocation = {
        id: previous?.id ?? `allocation-${crypto.randomUUID()}`, roleId: input.roleId, personExternalId: externalId,
        personName: person?.name ?? input.personName, personEmail: person?.email ?? input.personEmail ?? null,
        quarterKey: input.quarterKey, estimatedHours: input.estimatedHours, role: clone(roleOf(state, input.roleId)),
        periods: input.periods.map((item, i) => ({ ...item, id: previous?.periods[i]?.id ?? `period-${crypto.randomUUID()}` })),
      };
      if (index >= 0) item.allocations[index] = allocation; else item.allocations.push(allocation);
      return clone(allocation);
    }
    case 'rebalanceAllocations': {
      const ids = Array.isArray(arg0) ? new Set<unknown>(arg0) : new Set();
      const item = state.plan.workItems.find((candidate) => candidate.allocations.some(({ id }) => ids.has(id)));
      if (item) assertAssignableWorkItem(item);
      const first = item?.allocations.find(({ id }) => ids.has(id));
      const group = item?.allocations.filter((row) => row.roleId === first?.roleId
        && (row.quarterKey ?? LEGACY_QUARTER_KEY) === (first?.quarterKey ?? LEGACY_QUARTER_KEY)) ?? [];
      if (group.length !== ids.size || group.some(({ id }) => !ids.has(id))) {
        throw new Error('Состав назначений изменился. Обновите план и повторите действие.');
      }
      group.sort((left, right) => left.id.localeCompare(right.id));
      const balanced = rebalanceAllocations(group);
      if (!balanced) throw new Error('Часы нельзя распределить с сохранением текущей оценки и шага 0,5 ч.');
      balanced.forEach(({ estimatedHours, periods }, index) => {
        group[index].estimatedHours = estimatedHours;
        group[index].periods = periods.map((period) => ({ ...period, id: `period-${crypto.randomUUID()}` }));
      });
      return { updated: balanced.length };
    }
    case 'saveAllocationQuarter': {
      const allocationId = String(arg0); const quarterKey = String(arg1); const months = arg2 as { monthKey: string; hours: number }[];
      const item = state.plan.workItems.find((candidate) => candidate.allocations.some(({ id }) => id === allocationId));
      const allocation = item?.allocations.find(({ id }) => id === allocationId);
      if (!item || !allocation) throw new Error('Демо-назначение не найдено.');
      assertAssignableWorkItem(item);
      const match = quarterKey.match(/^(\d{4})-Q([1-4])$/);
      if (!match) throw new Error('Некорректный квартал.');
      const year = Number(match[1]); const quarter = Number(match[2]);
      const keys = Array.from({ length: 3 }, (_, i) => `${year}-${String((quarter - 1) * 3 + i + 1).padStart(2, '0')}`);
      allocation.periods = allocation.periods.filter((item) => !item.monthKey || !keys.includes(item.monthKey));
      for (const month of months) if (keys.includes(month.monthKey)) allocation.periods.push(monthPeriod(month.monthKey, month.hours));
      return clone(allocation.periods);
    }
    default: throw new Error('Неизвестная операция Roadmap demo.');
  }
}
