import type { AllocationSnapshot, PlanChange } from '../api/planChangesApi';

/** Pure text for plan change entries: no React, so it can be tested on its own. */

const AZURE_AUTHOR = 'Azure DevOps';
const MONTHS = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const hoursFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

export interface PlanChangeDescription {
  /** The action in the past tense: «Изменил часы». */
  verb: string;
  /** What exactly changed. */
  text: string;
  /** Who made the change: the person, or Azure DevOps when no one did. */
  author: string;
  /** «Ассистент (применил X)» / «Из Azure DevOps» for changes that did not come from the plan screen. */
  origin: string | null;
  /** Azure id of the Task an Azure-sourced change came from: shown after the origin as «(задача #N)». */
  taskId: string | null;
  /** Role and quarter, when `text` does not already name them. */
  context: string | null;
}

export interface PlanChangeGroup {
  batchId: string;
  items: PlanChange[];
}

export const formatPlanHours = (value: number) => hoursFormat.format(value);

/** `2026-Q4` → `Q4 2026`. */
export function formatQuarter(quarterKey: string): string {
  const match = /^(\d{4})-Q([1-4])$/.exec(quarterKey);
  return match ? `Q${match[2]} ${match[1]}` : quarterKey;
}

/** `2026-10` → `окт`. */
export function formatMonth(monthKey: string): string {
  const index = Number(monthKey.slice(5, 7)) - 1;
  return MONTHS[index] ?? monthKey;
}

/** Month hours that differ between two snapshots: «окт 8 → 12, ноя 8 → 12». */
function monthChanges(before: AllocationSnapshot, after: AllocationSnapshot): string[] {
  const from = new Map(before.months.map((month) => [month.monthKey, month.hours]));
  const to = new Map(after.months.map((month) => [month.monthKey, month.hours]));
  return [...new Set([...from.keys(), ...to.keys()])]
    .sort()
    .flatMap((monthKey) => {
      const was = from.get(monthKey) ?? 0;
      const now = to.get(monthKey) ?? 0;
      return was === now ? [] : [`${formatMonth(monthKey)} ${formatPlanHours(was)} → ${formatPlanHours(now)}`];
    });
}

const TASK_OUTCOME: Record<string, string> = {
  state: 'задача в Azure закрыта',
  deleted: 'задача в Azure удалена',
  kept: 'задача в Azure оставлена',
};

export function planChangeAuthor(change: Pick<PlanChange, 'actorName' | 'actorEmail' | 'source'>): string {
  return change.actorName ?? change.actorEmail ?? (change.source === 'azure' ? AZURE_AUTHOR : '—');
}

function planChangeOrigin(change: PlanChange): string | null {
  if (change.source === 'ai') return `Ассистент (применил ${planChangeAuthor(change)})`;
  if (change.source === 'azure') return 'Из Azure DevOps';
  return null;
}

export function describePlanChange(change: PlanChange): PlanChangeDescription {
  const base = {
    author: planChangeAuthor(change),
    origin: planChangeOrigin(change),
    taskId: change.source === 'azure' ? change.azureTaskId : null,
  };
  const { before, after } = change;
  const place = `${change.roleName} · ${formatQuarter(change.quarterKey)}`;

  if (change.action === 'created' && after) {
    return {
      ...base,
      verb: 'Создал назначение',
      text: `${change.roleName} · ${after.personName} · ${formatQuarter(after.quarterKey)} · ${formatPlanHours(after.estimatedHours)} ч`,
      context: null,
    };
  }

  if (change.action === 'deleted' && before) {
    const outcome = change.details.task ? TASK_OUTCOME[change.details.task] : undefined;
    return {
      ...base,
      verb: 'Удалил назначение',
      text: [before.personName, `${formatPlanHours(before.estimatedHours)} ч`, outcome].filter(Boolean).join(' · '),
      context: place,
    };
  }

  if (before && after) {
    const roleHours = change.details.roleHours;
    const hoursChanged = before.estimatedHours !== after.estimatedHours;
    const months = monthChanges(before, after);
    const hoursText = `${formatPlanHours(before.estimatedHours)} → ${formatPlanHours(after.estimatedHours)} ч`;
    const roleHoursText = roleHours ? `часы роли ${formatPlanHours(roleHours.from)} → ${formatPlanHours(roleHours.to)} ч` : null;

    if (before.personExternalId !== after.personExternalId) {
      return {
        ...base,
        verb: 'Сменил исполнителя',
        text: [`${before.personName} → ${after.personName}`, place, hoursChanged ? hoursText : null, roleHoursText].filter(Boolean).join(' · '),
        context: null,
      };
    }
    if (hoursChanged) {
      return {
        ...base,
        verb: 'Изменил часы',
        text: [`${after.personName} · ${hoursText}${months.length ? ` (${months.join(', ')})` : ''}`, roleHoursText].filter(Boolean).join(' · '),
        context: place,
      };
    }
    if (months.length) {
      return {
        ...base,
        verb: 'Изменил разбивку по месяцам',
        text: `${after.personName} · ${months.join(', ')}`,
        context: place,
      };
    }
    if (before.quarterKey !== after.quarterKey) {
      return {
        ...base,
        verb: 'Перенёс в другой квартал',
        text: `${after.personName} · ${formatQuarter(before.quarterKey)} → ${formatQuarter(after.quarterKey)}`,
        context: change.roleName,
      };
    }
  }

  return { ...base, verb: 'Изменил назначение', text: before?.personName ?? after?.personName ?? '', context: place };
}

/** Russian plural: 1 назначение, 2 назначения, 5 назначений. */
export function pluralize(count: number, one: string, few: string, many: string): string {
  const tens = count % 100;
  const units = count % 10;
  if (tens >= 11 && tens <= 14) return many;
  if (units === 1) return one;
  if (units >= 2 && units <= 4) return few;
  return many;
}

/** Heading of a group of entries made by one action. */
export function describePlanChangeGroup(group: PlanChangeGroup): { title: string; author: string } {
  const first = group.items[0];
  const author = planChangeAuthor(first);
  const count = group.items.length;
  const allocations = `${count} ${pluralize(count, 'назначение', 'назначения', 'назначений')}`;
  const title = first.source === 'azure' ? `Изменения из Azure DevOps — ${allocations}`
    : first.source === 'ai' ? `${author} применил предложения ассистента — ${allocations}`
      : `${author} перераспределил часы — ${allocations}`;
  return { title, author };
}

/** Folds neighbouring entries of one action (`batchId`) into groups; the order is kept. */
export function groupByBatch(items: PlanChange[]): PlanChangeGroup[] {
  const groups: PlanChangeGroup[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.batchId === item.batchId) last.items.push(item);
    else groups.push({ batchId: item.batchId, items: [item] });
  }
  return groups;
}

const dateTimeFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export function formatPlanChangeTime(createdAt: string): string {
  const date = new Date(createdAt);
  return Number.isNaN(date.getTime()) ? '' : dateTimeFormat.format(date);
}
