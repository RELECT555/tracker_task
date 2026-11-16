import type { RoadmapNotificationDto, RoadmapNotificationSummary } from '@tracker/shared';

export type NotificationBadge = { kind: 'count'; label: string } | { kind: 'dot' };

const MAX_BADGE_COUNT = 9;

/** Active unread problems show a number; with only resolved unread items there is a bare dot. */
export function badgeOf(summary: RoadmapNotificationSummary | undefined): NotificationBadge | null {
  if (!summary) return null;
  if (summary.activeUnread > 0) {
    return {
      kind: 'count',
      label: summary.activeUnread > MAX_BADGE_COUNT ? `${MAX_BADGE_COUNT}+` : String(summary.activeUnread),
    };
  }
  return summary.unread > 0 ? { kind: 'dot' } : null;
}

export type ProblemTone = 'active' | 'fixed' | 'obsolete';

/** Status label and colours shared by the popover and the sync problems page. */
export const PROBLEM_STATUS_META: Record<ProblemTone, { label: string; dotClass: string; textClass: string; bgClass: string }> = {
  active: { label: 'Активна', dotClass: 'bg-destructive', textClass: 'text-destructive', bgClass: 'bg-destructive/10' },
  fixed: {
    label: 'Исправлено',
    dotClass: 'bg-emerald-500',
    textClass: 'text-emerald-700 dark:text-emerald-400',
    bgClass: 'bg-emerald-500/10',
  },
  obsolete: { label: 'Больше не актуально', dotClass: 'bg-muted-foreground', textClass: 'text-muted-foreground', bgClass: 'bg-muted' },
};

export function notificationTone(item: Pick<RoadmapNotificationDto, 'active' | 'resolution'>): ProblemTone {
  if (item.active) return 'active';
  return item.resolution === 'obsolete' ? 'obsolete' : 'fixed';
}

/** The backend appends "· Project" to titles; views that show the project separately drop that suffix. */
export function titleWithoutProject(title: string, projectName: string | null | undefined): string {
  const suffix = projectName ? ` · ${projectName}` : '';
  return suffix && title.endsWith(suffix) ? title.slice(0, -suffix.length) : title;
}

/** Live figure of a still-open problem, shown only once it differs from the count it was raised with. */
export function currentLabel(item: Pick<RoadmapNotificationDto, 'active' | 'current' | 'openedCount'>): string | null {
  const count = item.active ? item.current?.count : undefined;
  if (count === undefined || count === item.openedCount) return null;
  return `сейчас: ${count}`;
}

/** '<1 мин', '25 мин', '2 ч 5 мин', '3 дн'. */
export function durationLabel(openedAt: string, endedAt: string): string {
  const ms = Math.max(new Date(endedAt).getTime() - new Date(openedAt).getTime(), 0);
  if (ms < 60_000) return '<1 мин';
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return minutes % 60 ? `${hours} ч ${minutes % 60} мин` : `${hours} ч`;
  return `${Math.floor(hours / 24)} дн`;
}

/** Shown from the second occurrence: '2-й раз за 7 дней'. */
export function recurrenceLabel(n: number): string | null {
  return n >= 2 ? `${n}-й раз за 7 дней` : null;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function relativeTime(iso: string, now: Date = new Date()): string {
  const created = new Date(iso);
  const age = now.getTime() - created.getTime();
  if (age < MINUTE) return 'только что';
  if (age < HOUR) return `${Math.floor(age / MINUTE)} мин назад`;
  if (age < DAY) return `${Math.floor(age / HOUR)} ч назад`;
  if (age < 2 * DAY) return 'вчера';
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(created.getDate())}.${pad(created.getMonth() + 1)}.${created.getFullYear()}`;
}
