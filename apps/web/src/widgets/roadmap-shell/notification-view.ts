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

export function statusLabel(item: Pick<RoadmapNotificationDto, 'active' | 'resolution'>): string | null {
  if (item.active) return null;
  if (item.resolution === 'fixed') return 'исправлено';
  if (item.resolution === 'obsolete') return 'больше не актуально';
  return null;
}

/** Live figure of a still-open problem; the stored title keeps the count from when it was raised. */
export function currentLabel(item: Pick<RoadmapNotificationDto, 'active' | 'current'>): string | null {
  const count = item.active ? item.current?.count : undefined;
  return count === undefined ? null : `сейчас: ${count}`;
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
