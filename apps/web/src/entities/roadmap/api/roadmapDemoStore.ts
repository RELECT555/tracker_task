import type {
  AzureProject, RoadmapAllocation, RoadmapIntegrationSettings, RoadmapPeriod,
  RoadmapPerson, RoadmapProjectPlan, RoadmapRole,
} from './roadmapApi';

export const DEMO_BLOB_PATH = 'roadmap/demo-state-v1.json';
const PROJECT_ID = 'demo-roadmap-project';
const AZURE_PROJECT_ID = 'demo-azure-project';
type DemoPerson = RoadmapPerson & { externalId: string };

export type DemoState = {
  version: 1;
  organizationUrl: string;
  projects: AzureProject[];
  people: DemoPerson[];
  roles: RoadmapRole[];
  roleCatalog: Pick<RoadmapRole, 'id' | 'name' | 'color' | 'isMock'>[];
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
        personIsActive: true, personIsMock: true };
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
    id: `item-${externalId}`, externalId, parentExternalId, type, title, state, url: null, allocations: [],
  }));

  const person = (externalId: string) => peopleSeed.find((item) => item.externalId === externalId)!;
  const role = (id: string) => roles.find((item) => item.id === id)!;
  const addAllocation = (itemKey: string, roleId: string, personId: string, estimatedHours: number, months: Record<string, number>) => {
    const item = workItems.find((candidate) => candidate.externalId === itemKey)!;
    const member = person(personId);
    const assignedRole = role(roleId);
    const allocation: RoadmapAllocation = {
      id: `allocation-${itemKey}-${roleId}-${personId}`, roleId, personExternalId: personId,
      personName: member.name, personEmail: member.email, estimatedHours,
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
    people: peopleSeed.map((item) => ({ ...item, roles: [] })), roles, roleCatalog: catalogSeed, plan,
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
function peopleWithRoles(state: DemoState): RoadmapPerson[] {
  return state.people.map((person) => ({
    ...person,
    roles: rolesOf(state).filter((role) => role.members?.some((member) => member.personExternalId === person.externalId))
      .map((role) => ({ id: role.id, name: role.name, color: role.color, projectName: state.plan.name })),
  }));
}
function planOf(state: DemoState): RoadmapProjectPlan {
  return { ...state.plan, roles: clone(rolesOf(state)), workItems: state.plan.workItems.map((item) => ({
    ...item, allocations: item.allocations.map((allocation) => ({ ...allocation, role: clone(roleOf(state, allocation.roleId)) })),
  })) };
}
function integrationSettings(state: DemoState): RoadmapIntegrationSettings {
  return { provider: 'azure-devops', organizationUrl: state.organizationUrl, configured: false,
    patConfigured: false, source: 'unconfigured', encryptionKeyConfigured: false };
}
function findWorkItem(state: DemoState, id: string) {
  const item = state.plan.workItems.find((candidate) => candidate.id === id || candidate.externalId === id);
  if (!item) throw new Error('Демо-задача не найдена. Обновите страницу и повторите действие.');
  return item;
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
    case 'projects': return { data: clone(state.projects), source: 'cache' };
    case 'syncProject': return { projectId: PROJECT_ID, importedWorkItems: state.plan.workItems.length };
    case 'plan': return planOf(state);
    case 'people': return { data: peopleWithRoles(state) };
    case 'roles': case 'adminRoles': return clone(rolesOf(state));
    case 'adminPeople': return peopleWithRoles(state);
    case 'syncAdminPeople': return { synced: state.people.length, ignored: 0 };
    case 'roleCatalog': return clone(state.roleCatalog);
    case 'createRoleTemplate': {
      const role = { id: `template-${crypto.randomUUID()}`, name: String(arg0), color: arg1 ?? '#6366f1', isMock: true };
      state.roleCatalog.push(role); return clone(role);
    }
    case 'addRoleFromCatalog': {
      const template = state.roleCatalog.find((item) => item.id === arg1);
      if (!template) throw new Error('Шаблон роли не найден.');
      const existing = rolesOf(state).find((item) => item.name === template.name);
      if (existing) return clone(existing);
      const role: RoadmapRole = { ...template, projectId: PROJECT_ID, members: [] };
      state.roles.push(role); state.plan.roles = rolesOf(state); return clone(role);
    }
    case 'createRole': {
      const role: RoadmapRole = { id: `role-${crypto.randomUUID()}`, projectId: PROJECT_ID,
        name: String(arg1), color: arg2 ?? '#6366f1', isMock: true, members: [] };
      state.roles.push(role); state.plan.roles = rolesOf(state); return clone(role);
    }
    case 'updateRole': {
      const role = roleOf(state, arg0); Object.assign(role, arg1); return clone(role);
    }
    case 'setRoleMembers': {
      const role = roleOf(state, arg0);
      role.members = normalizePersonIds(state, arg1).flatMap((externalId) => {
        const person = state.people.find((item) => item.externalId === externalId);
        return person ? [{ personExternalId: person.externalId, personName: person.name,
          personEmail: person.email, personIsActive: person.isActive ?? true, personIsMock: true }] : [];
      });
      return clone(role);
    }
    case 'setRoleDefaultPerson': {
      const role = roleOf(state, arg0);
      const externalId = arg1 ? normalizePersonIds(state, [arg1])[0] : null;
      const person = state.people.find((item) => item.externalId === externalId);
      role.defaultPersonExternalId = person?.externalId ?? null;
      role.defaultPersonName = person?.name ?? null; role.defaultPersonEmail = person?.email ?? null;
      role.defaultPersonIsMock = Boolean(person); return clone(role);
    }
    case 'deleteRole': {
      state.roles = state.roles.filter((item) => item.id !== arg0);
      state.plan.workItems.forEach((item) => { item.allocations = item.allocations.filter((allocation) => allocation.roleId !== arg0); });
      state.plan.roles = rolesOf(state); return { deleted: true };
    }
    case 'saveAllocation': {
      const input = arg0 as { allocationId?: string; workItemId: string; roleId: string; personExternalId: string; personName: string; personEmail?: string | null; estimatedHours: number; periods: Omit<RoadmapPeriod, 'id'>[] };
      const item = findWorkItem(state, input.workItemId);
      const externalId = normalizePersonIds(state, [input.personExternalId])[0];
      const person = state.people.find((candidate) => candidate.externalId === externalId);
      const index = item.allocations.findIndex((allocation) => allocation.id === input.allocationId ||
        (allocation.roleId === input.roleId && allocation.personExternalId === externalId));
      const previous = index >= 0 ? item.allocations[index] : undefined;
      const allocation: RoadmapAllocation = {
        id: previous?.id ?? `allocation-${crypto.randomUUID()}`, roleId: input.roleId, personExternalId: externalId,
        personName: person?.name ?? input.personName, personEmail: person?.email ?? input.personEmail ?? null,
        estimatedHours: input.estimatedHours, role: clone(roleOf(state, input.roleId)),
        periods: input.periods.map((item, i) => ({ ...item, id: previous?.periods[i]?.id ?? `period-${crypto.randomUUID()}` })),
      };
      if (index >= 0) item.allocations[index] = allocation; else item.allocations.push(allocation);
      return clone(allocation);
    }
    case 'saveAllocationQuarter': {
      const allocationId = String(arg0); const quarterKey = String(arg1); const months = arg2 as { monthKey: string; hours: number }[];
      const allocation = state.plan.workItems.flatMap((item) => item.allocations).find((item) => item.id === allocationId);
      if (!allocation) throw new Error('Демо-назначение не найдено.');
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
