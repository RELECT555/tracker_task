export type SlaState = 'none' | 'ok' | 'warning' | 'critical' | 'overdue';

const FOUR_HOURS_MS = 4 * 60 * 60 * 1000;

export function getSlaState(
  dueAt: string | null | undefined,
  assignedAt?: string | null,
): SlaState {
  if (!dueAt) {
    return 'none';
  }

  const dueMs = new Date(dueAt).getTime();
  if (Number.isNaN(dueMs)) {
    return 'none';
  }

  const now = Date.now();
  if (dueMs <= now) {
    return 'overdue';
  }

  const remainingMs = dueMs - now;
  if (remainingMs <= FOUR_HOURS_MS) {
    return 'critical';
  }

  if (assignedAt) {
    const assignedMs = new Date(assignedAt).getTime();
    if (!Number.isNaN(assignedMs)) {
      const totalMs = dueMs - assignedMs;
      if (totalMs > 0 && remainingMs / totalMs < 0.5) {
        return 'warning';
      }
    }
  }

  return 'ok';
}

export function formatSlaDueDate(dueAt: string): string {
  return new Date(dueAt).toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function slaStateLabel(state: SlaState): string | null {
  switch (state) {
    case 'overdue':
      return 'Просрочен';
    case 'critical':
      return 'Мало времени';
    case 'warning':
      return 'Скоро дедлайн';
    default:
      return null;
  }
}
