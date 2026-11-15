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

/** Квартал из параметра URL вида `2026-Q4`; при некорректном значении — текущий. */
export function parseQuarterKey(key: string | null | undefined) {
  const match = /^(\d{4})-Q([1-4])$/.exec(key ?? '');
  return match ? quarterRef(Number(match[1]), Number(match[2])) : currentQuarterRef();
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

const sumEstimate = (allocations: RoadmapAllocation[]) => allocations.reduce((sum, allocation) => sum + Number(allocation.estimatedHours), 0);
const isEpic = (item: RoadmapWorkItem) => item.type.toLocaleLowerCase('ru-RU') === 'epic';
const isFeature = (item: RoadmapWorkItem) => item.type.toLocaleLowerCase('ru-RU') === 'feature';
const isOpen = (item: RoadmapWorkItem) => ['new', 'active'].includes(statusGroup(item.state));

export type RoleShare = { roleId: string; hours: number };
export type PersonRow = { id: string; name: string; email: string | null; roleIds: string[]; months: number[]; total: number; estimate: number; features: number };
export type RoleRow = { id: string; name: string; color: string; quarterHours: number; estimate: number };
export type QuarterEpicRow = { id: string; title: string; url: string | null; quarterHours: number; estimate: number; byRole: RoleShare[] };
export type ProgressEpicRow = {
  id: string; title: string; state: string | null; group: StatusGroup; url: string | null;
  features: number; done: number; estimate: number; actual: number;
};
export type AttentionItem = { id: string; kind: 'unassigned' | 'unspread'; title: string; detail: string; url: string | null };
export type OverrunItem = { id: string; title: string; url: string | null; estimate: number; actual: number };

function roleShares(allocations: RoadmapAllocation[], value: (allocation: RoadmapAllocation) => number) {
  const map = new Map<string, number>();
  allocations.forEach((allocation) => map.set(allocation.roleId, (map.get(allocation.roleId) ?? 0) + value(allocation)));
  return [...map.entries()].filter(([, hours]) => hours > 0).map(([roleId, hours]) => ({ roleId, hours }));
}

/** Фичи, сгруппированные по корневому эпику; ключ `''` — фичи без эпика. */
function groupByEpic(items: RoadmapWorkItem[]) {
  const byExternalId = new Map(items.map((item) => [item.externalId, item]));
  const rootEpic = (item: RoadmapWorkItem) => {
    let current: RoadmapWorkItem | undefined = item;
    const seen = new Set<string>();
    while (current && !isEpic(current) && current.parentExternalId && !seen.has(current.externalId)) {
      seen.add(current.externalId);
      current = byExternalId.get(current.parentExternalId);
    }
    return current && isEpic(current) ? current : null;
  };
  const groups = new Map<string, RoadmapWorkItem[]>();
  items.filter(isFeature).forEach((feature) => {
    const key = rootEpic(feature)?.id ?? '';
    groups.set(key, [...(groups.get(key) ?? []), feature]);
  });
  const rows: { id: string; title: string; epic: RoadmapWorkItem | null; children: RoadmapWorkItem[] }[] =
    items.filter(isEpic).map((epic) => ({ id: epic.id, title: epic.title, epic, children: groups.get(epic.id) ?? [] }));
  const orphans = groups.get('') ?? [];
  if (orphans.length) rows.push({ id: 'no-epic', title: 'Без эпика', epic: null, children: orphans });
  return rows;
}

/** Загрузка квартала: оценка, раскладка по месяцам, люди, роли и замечания к плану. */
export function buildCapacity(plan: RoadmapProjectPlan, quarter: QuarterRef) {
  const items = plan.workItems;
  const quarterAllocations = (item: RoadmapWorkItem) => item.allocations.filter((allocation) => allocation.quarterKey === quarter.key);
  const quarterAll = items.flatMap(quarterAllocations);

  const estimate = sumEstimate(quarterAll);
  const distributed = quarterAll.reduce((sum, allocation) => sum + hoursInMonths(allocation, quarter.monthKeys), 0);

  const openFeatures = items.filter((item) => isFeature(item) && isOpen(item));
  const covered = openFeatures.filter((feature) => quarterAllocations(feature).length > 0).length;

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

  const roles: RoleRow[] = plan.roles.flatMap((role) => {
    const roleAllocations = quarterAll.filter((allocation) => allocation.roleId === role.id);
    if (!roleAllocations.length) return [];
    return [{
      id: role.id,
      name: role.name,
      color: role.color,
      quarterHours: roleAllocations.reduce((sum, allocation) => sum + hoursInMonths(allocation, quarter.monthKeys), 0),
      estimate: sumEstimate(roleAllocations),
    }];
  }).sort((a, b) => b.quarterHours - a.quarterHours || b.estimate - a.estimate);

  const epics: QuarterEpicRow[] = groupByEpic(items).flatMap(({ id, title, epic, children }) => {
    const scoped = [...(epic ? [epic] : []), ...children].flatMap(quarterAllocations);
    if (!scoped.length) return [];
    return [{
      id, title, url: epic?.url ?? null,
      quarterHours: scoped.reduce((sum, allocation) => sum + hoursInMonths(allocation, quarter.monthKeys), 0),
      estimate: sumEstimate(scoped),
      byRole: roleShares(scoped, (allocation) => hoursInMonths(allocation, quarter.monthKeys)),
    }];
  }).sort((a, b) => b.estimate - a.estimate);

  const attention: AttentionItem[] = [];
  openFeatures.forEach((feature) => {
    const scoped = quarterAllocations(feature);
    if (!scoped.length) {
      attention.push({ id: `${feature.id}-unassigned`, kind: 'unassigned', title: feature.title, detail: `Нет назначений на ${quarter.label}`, url: feature.url });
      return;
    }
    const featureEstimate = sumEstimate(scoped);
    const featureDistributed = scoped.reduce((sum, allocation) => sum + hoursInMonths(allocation, quarter.monthKeys), 0);
    if (Math.abs(featureEstimate - featureDistributed) >= 0.5) {
      attention.push({ id: `${feature.id}-unspread`, kind: 'unspread', title: feature.title, detail: `Оценка ${formatHours(featureEstimate)}, по месяцам ${formatHours(featureDistributed)}`, url: feature.url });
    }
  });
  attention.sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'unspread' ? -1 : 1));

  return {
    estimate,
    distributed,
    features: { open: openFeatures.length, covered },
    people,
    roles,
    epics,
    attention,
  };
}

/** Прогресс проекта целиком, без привязки к кварталу. */
export function buildProgress(plan: RoadmapProjectPlan) {
  const features = plan.workItems.filter(isFeature);

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

  const featureEstimate = (feature: RoadmapWorkItem) => sumEstimate(feature.allocations);
  const actual = (item: RoadmapWorkItem) => Number(item.actualHours ?? 0);

  const epics: ProgressEpicRow[] = groupByEpic(plan.workItems).map(({ id, title, epic, children }) => {
    const live = children.filter((child) => statusGroup(child.state) !== 'removed');
    return {
      id, title, state: epic?.state ?? null, group: statusGroup(epic?.state ?? null), url: epic?.url ?? null,
      features: live.length,
      done: live.filter((child) => statusGroup(child.state) === 'done').length,
      estimate: [...(epic ? [epic] : []), ...children].reduce((sum, item) => sum + featureEstimate(item), 0),
      actual: children.reduce((sum, child) => sum + actual(child), 0),
    };
  });

  const overruns: OverrunItem[] = features.flatMap((feature) => {
    const estimate = featureEstimate(feature);
    return estimate > 0 && actual(feature) > estimate
      ? [{ id: feature.id, title: feature.title, url: feature.url, estimate, actual: actual(feature) }]
      : [];
  }).sort((a, b) => (b.actual - b.estimate) / b.estimate - (a.actual - a.estimate) / a.estimate);

  const removed = statusCounts.get('removed') ?? 0;
  return {
    counts: {
      features: features.length,
      // Отменённые фичи не входят в базу готовности.
      scope: features.length - removed,
      done: statusCounts.get('done') ?? 0,
      active: statusCounts.get('active') ?? 0,
    },
    hours: {
      actual: features.reduce((sum, feature) => sum + actual(feature), 0),
      estimate: features.reduce((sum, feature) => sum + featureEstimate(feature), 0),
    },
    statuses,
    epics,
    overruns,
  };
}

export type CapacityAnalytics = ReturnType<typeof buildCapacity>;
export type ProgressAnalytics = ReturnType<typeof buildProgress>;

const numberFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 });
export const formatNumber = (value: number) => numberFormat.format(value);
export const formatHours = (value: number) => `${numberFormat.format(value)} ч`;
export const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
/** Процент для подписи: ненулевая доля меньше 1% не показывается как «0%». */
export const formatPercent = (part: number, whole: number) => (part > 0 && whole > 0 && percent(part, whole) === 0 ? '<1%' : `${percent(part, whole)}%`);
