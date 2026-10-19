import type { RoadmapAllocation, RoadmapProjectPlan, RoadmapWorkItem } from '@/entities/roadmap/api/roadmapApi';

export type QuarterRef = { year: number; quarter: number; key: string; label: string; monthKeys: string[] };
export type StatusGroup = 'new' | 'active' | 'done' | 'removed';

export const statusGroupOrder: StatusGroup[] = ['done', 'active', 'new', 'removed'];
export const statusGroupLabels: Record<StatusGroup, string> = {
  new: 'Не начаты',
  active: 'В работе',
  done: 'Готово',
  removed: 'Отменены',
};

const doneStates = ['closed', 'done', 'resolved', 'completed', 'готово', 'завершено', 'закрыто', 'выполнено'];
const removedStates = ['removed', 'cut', 'cancelled', 'canceled', 'удалено', 'отменено'];
const newStates = ['new', 'proposed', 'to do', 'todo', 'backlog', 'новый', 'новая', 'новое', 'предложено'];

export function statusGroup(state: string | null): StatusGroup {
  const value = state?.trim().toLocaleLowerCase('ru-RU') ?? '';
  if (doneStates.includes(value)) return 'done';
  if (removedStates.includes(value)) return 'removed';
  if (!value || newStates.includes(value)) return 'new';
  return 'active';
}

export function quarterRef(year: number, quarter: number): QuarterRef {
  return {
    year,
    quarter,
    key: `${year}-Q${quarter}`,
    label: `Q${quarter} ${year}`,
    monthKeys: Array.from({ length: 3 }, (_, index) => `${year}-${String((quarter - 1) * 3 + index + 1).padStart(2, '0')}`),
  };
}

export function currentQuarterRef() {
  const date = new Date();
  return quarterRef(date.getFullYear(), Math.floor(date.getMonth() / 3) + 1);
}

export function shiftQuarter(ref: QuarterRef, offset: number) {
  const date = new Date(ref.year, (ref.quarter - 1) * 3 + offset * 3, 1);
  return quarterRef(date.getFullYear(), Math.floor(date.getMonth() / 3) + 1);
}

const shortMonth = new Intl.DateTimeFormat('ru-RU', { month: 'short', timeZone: 'UTC' });
const longMonth = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export function monthLabel(monthKey: string, long = false) {
  const [year, month] = monthKey.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));
  const label = (long ? longMonth : shortMonth).format(date).replace('.', '').replace(' г', '');
  return label.charAt(0).toLocaleUpperCase('ru-RU') + label.slice(1);
}

function periodMonth(period: RoadmapAllocation['periods'][number]) {
  return period.monthKey ?? period.startsAt?.slice(0, 7) ?? '';
}

function hoursInMonths(allocation: RoadmapAllocation, monthKeys: string[]) {
  return allocation.periods.reduce((sum, period) => sum + (monthKeys.includes(periodMonth(period)) ? Number(period.hours) : 0), 0);
}

const isEpic = (item: RoadmapWorkItem) => item.type.toLocaleLowerCase('ru-RU') === 'epic';
const isFeature = (item: RoadmapWorkItem) => item.type.toLocaleLowerCase('ru-RU') === 'feature';

export type RoleShare = { roleId: string; hours: number };
export type MonthColumn = { monthKey: string; inQuarter: boolean; total: number; byRole: RoleShare[] };
export type PersonRow = { id: string; name: string; email: string | null; roleIds: string[]; months: number[]; total: number; estimate: number; features: number };
export type RoleRow = { id: string; name: string; color: string; quarterHours: number; estimate: number; people: number; features: number };
export type EpicRow = {
  id: string; title: string; state: string | null; group: StatusGroup; url: string | null;
  features: number; done: number; quarterHours: number; estimate: number; actual: number; byRole: RoleShare[];
};
export type AttentionItem = { id: string; kind: 'unassigned' | 'unspread' | 'overrun'; title: string; detail: string; url: string | null };

function roleShares(allocations: RoadmapAllocation[], value: (allocation: RoadmapAllocation) => number) {
  const map = new Map<string, number>();
  allocations.forEach((allocation) => map.set(allocation.roleId, (map.get(allocation.roleId) ?? 0) + value(allocation)));
  return [...map.entries()].filter(([, hours]) => hours > 0).map(([roleId, hours]) => ({ roleId, hours }));
}

export function buildAnalytics(plan: RoadmapProjectPlan, quarter: QuarterRef) {
  const items = plan.workItems;
  const byExternalId = new Map(items.map((item) => [item.externalId, item]));
  const epics = items.filter(isEpic);
  const features = items.filter(isFeature);
  const quarterAllocations = (item: RoadmapWorkItem) => item.allocations.filter((allocation) => allocation.quarterKey === quarter.key);
  const allAllocations = items.flatMap((item) => item.allocations);
  const quarterAll = allAllocations.filter((allocation) => allocation.quarterKey === quarter.key);

  const rootEpic = (item: RoadmapWorkItem) => {
    let current: RoadmapWorkItem | undefined = item;
    const seen = new Set<string>();
    while (current && !isEpic(current) && current.parentExternalId && !seen.has(current.externalId)) {
      seen.add(current.externalId);
      current = byExternalId.get(current.parentExternalId);
    }
    return current && isEpic(current) ? current : null;
  };

  // Квартал: оценка назначений квартала и её раскладка по месяцам квартала.
  const quarterEstimate = quarterAll.reduce((sum, allocation) => sum + Number(allocation.estimatedHours), 0);
  const quarterDistributed = quarterAll.reduce((sum, allocation) => sum + hoursInMonths(allocation, quarter.monthKeys), 0);

  // Загрузка по месяцам года: все месячные периоды, независимо от квартала назначения.
  const yearMonthKeys = Array.from({ length: 12 }, (_, index) => `${quarter.year}-${String(index + 1).padStart(2, '0')}`);
  const months: MonthColumn[] = yearMonthKeys.map((monthKey) => {
    const byRole = roleShares(allAllocations, (allocation) => hoursInMonths(allocation, [monthKey]));
    return { monthKey, inQuarter: quarter.monthKeys.includes(monthKey), total: byRole.reduce((sum, role) => sum + role.hours, 0), byRole };
  });

  // Статусы фич.
  const statusCounts = new Map<StatusGroup, number>(statusGroupOrder.map((group) => [group, 0]));
  const rawStates = new Map<string, { group: StatusGroup; count: number }>();
  features.forEach((feature) => {
    const group = statusGroup(feature.state);
    statusCounts.set(group, (statusCounts.get(group) ?? 0) + 1);
    const name = feature.state?.trim() || 'Без статуса';
    rawStates.set(name, { group, count: (rawStates.get(name)?.count ?? 0) + 1 });
  });
  const statuses = statusGroupOrder.map((group) => ({
    group,
    count: statusCounts.get(group) ?? 0,
    states: [...rawStates.entries()].filter(([, value]) => value.group === group).map(([name, value]) => ({ name, count: value.count })),
  }));

  const openFeatures = features.filter((feature) => ['new', 'active'].includes(statusGroup(feature.state)));
  const coveredFeatures = openFeatures.filter((feature) => quarterAllocations(feature).length > 0);
  const doneFeatures = statusCounts.get('done') ?? 0;
  const actualTotal = features.reduce((sum, feature) => sum + Number(feature.actualHours ?? 0), 0);
  const estimateTotal = features.reduce((sum, feature) => sum + feature.allocations.reduce((inner, allocation) => inner + Number(allocation.estimatedHours), 0), 0);

  // Команда в квартале.
  const peopleMap = new Map<string, PersonRow & { featureIds: Set<string>; roleSet: Set<string> }>();
  items.forEach((item) => quarterAllocations(item).forEach((allocation) => {
    const person = peopleMap.get(allocation.personExternalId) ?? {
      id: allocation.personExternalId, name: allocation.personName, email: allocation.personEmail, roleIds: [], months: [0, 0, 0], total: 0, estimate: 0, features: 0,
      featureIds: new Set<string>(), roleSet: new Set<string>(),
    };
    quarter.monthKeys.forEach((monthKey, index) => { person.months[index] += hoursInMonths(allocation, [monthKey]); });
    person.estimate += Number(allocation.estimatedHours);
    person.featureIds.add(item.id);
    person.roleSet.add(allocation.roleId);
    peopleMap.set(allocation.personExternalId, person);
  }));
  const people: PersonRow[] = [...peopleMap.values()].map(({ featureIds, roleSet, ...person }) => ({
    ...person,
    roleIds: [...roleSet],
    features: featureIds.size,
    total: person.months.reduce((sum, hours) => sum + hours, 0),
  })).sort((a, b) => b.total - a.total || b.estimate - a.estimate || a.name.localeCompare(b.name, 'ru'));

  // Роли.
  const roles: RoleRow[] = plan.roles.map((role) => {
    const roleAllocations = quarterAll.filter((allocation) => allocation.roleId === role.id);
    return {
      id: role.id,
      name: role.name,
      color: role.color,
      quarterHours: roleAllocations.reduce((sum, allocation) => sum + hoursInMonths(allocation, quarter.monthKeys), 0),
      estimate: roleAllocations.reduce((sum, allocation) => sum + Number(allocation.estimatedHours), 0),
      people: new Set(roleAllocations.map((allocation) => allocation.personExternalId)).size,
      features: new Set(items.filter((item) => quarterAllocations(item).some((allocation) => allocation.roleId === role.id)).map((item) => item.id)).size,
    };
  }).sort((a, b) => b.quarterHours - a.quarterHours || b.estimate - a.estimate);

  // Эпики (плюс фичи без эпика отдельной строкой).
  const epicGroups = new Map<string, RoadmapWorkItem[]>();
  features.forEach((feature) => {
    const key = rootEpic(feature)?.id ?? '';
    epicGroups.set(key, [...(epicGroups.get(key) ?? []), feature]);
  });
  const epicRow = (id: string, title: string, epic: RoadmapWorkItem | null, children: RoadmapWorkItem[]): EpicRow => {
    const scoped = [...(epic ? [epic] : []), ...children];
    const quarterScoped = scoped.flatMap(quarterAllocations);
    return {
      id, title, state: epic?.state ?? null, group: statusGroup(epic?.state ?? null), url: epic?.url ?? null,
      features: children.length,
      done: children.filter((child) => statusGroup(child.state) === 'done').length,
      quarterHours: quarterScoped.reduce((sum, allocation) => sum + hoursInMonths(allocation, quarter.monthKeys), 0),
      estimate: scoped.flatMap((item) => item.allocations).reduce((sum, allocation) => sum + Number(allocation.estimatedHours), 0),
      actual: children.reduce((sum, child) => sum + Number(child.actualHours ?? 0), 0),
      byRole: roleShares(quarterScoped, (allocation) => hoursInMonths(allocation, quarter.monthKeys)),
    };
  };
  const epicRows = epics.map((epic) => epicRow(epic.id, epic.title, epic, epicGroups.get(epic.id) ?? []));
  const orphans = epicGroups.get('') ?? [];
  if (orphans.length) epicRows.push(epicRow('no-epic', 'Без эпика', null, orphans));

  // Что требует внимания.
  const attention: AttentionItem[] = [];
  openFeatures.forEach((feature) => {
    const scoped = quarterAllocations(feature);
    if (!scoped.length) {
      attention.push({ id: `${feature.id}-unassigned`, kind: 'unassigned', title: feature.title, detail: `Нет назначений на ${quarter.label}`, url: feature.url });
      return;
    }
    const estimate = scoped.reduce((sum, allocation) => sum + Number(allocation.estimatedHours), 0);
    const distributed = scoped.reduce((sum, allocation) => sum + hoursInMonths(allocation, quarter.monthKeys), 0);
    if (Math.abs(estimate - distributed) >= 0.5) {
      attention.push({ id: `${feature.id}-unspread`, kind: 'unspread', title: feature.title, detail: `Оценка ${formatHours(estimate)}, по месяцам ${formatHours(distributed)}`, url: feature.url });
    }
  });
  features.forEach((feature) => {
    const estimate = feature.allocations.reduce((sum, allocation) => sum + Number(allocation.estimatedHours), 0);
    const actual = Number(feature.actualHours ?? 0);
    if (estimate > 0 && actual > estimate) {
      attention.push({ id: `${feature.id}-overrun`, kind: 'overrun', title: feature.title, detail: `Факт ${formatHours(actual)} при оценке ${formatHours(estimate)} (+${Math.round(((actual - estimate) / estimate) * 100)}%)`, url: feature.url });
    }
  });

  return {
    counts: { epics: epics.length, features: features.length, open: openFeatures.length, covered: coveredFeatures.length, done: doneFeatures },
    quarter: { estimate: quarterEstimate, distributed: quarterDistributed },
    hours: { actual: actualTotal, estimate: estimateTotal },
    months, statuses, people, roles, epicRows, attention,
  };
}

export type RoadmapAnalytics = ReturnType<typeof buildAnalytics>;

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
export const formatNumber = (value: number) => numberFormat.format(value);
export const formatHours = (value: number) => `${numberFormat.format(value)} ч`;
export const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

export function niceMax(value: number) {
  if (value <= 0) return 4;
  const raw = value / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((candidate) => candidate >= raw) ?? raw;
  return step * 4;
}
