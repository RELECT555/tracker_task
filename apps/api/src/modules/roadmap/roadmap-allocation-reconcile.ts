/**
 * Decisions for two-way sync of a Roadmap allocation and the Azure DevOps Task that mirrors it.
 * Kept free of I/O so the rules are easy to test and read in one place.
 */

export type ConflictPolicy = 'overwrite' | 'skip-field' | 'stop';

export type EstimateDecision =
  /** Nothing changed in Azure since the last push. */
  | { action: 'none' }
  /** Azure changed it and Roadmap did not: take the Azure value into the plan. */
  | { action: 'accept'; hours: number }
  /** Both sides changed; Roadmap's value will overwrite Azure on the next push. */
  | { action: 'keep-roadmap' }
  /** Both sides changed and the policy says to stop and ask a person. */
  | { action: 'conflict'; message: string };

const same = (left: number, right: number) => Math.abs(left - right) < 0.005;

export function decideEstimate(input: {
  /** Original Estimate currently on the Azure Task; null when the field is empty or missing. */
  azure: number | null;
  /** Estimate Roadmap last wrote to the Task; null when it was never written. */
  pushed: number | null;
  /** Estimate in the Roadmap plan now. */
  planned: number;
  policy: ConflictPolicy;
}): EstimateDecision {
  const { azure, pushed, planned, policy } = input;
  if (azure === null || pushed === null || same(azure, pushed))
    return { action: 'none' };
  if (same(planned, pushed) || same(planned, azure))
    return { action: 'accept', hours: azure };
  if (policy === 'skip-field') return { action: 'accept', hours: azure };
  if (policy === 'stop')
    return {
      action: 'conflict',
      message: `Оценку изменили и в Roadmap (${planned} ч), и в Azure DevOps (${azure} ч). Выберите, какую оставить.`,
    };
  return { action: 'keep-roadmap' };
}

/**
 * Shrinks the monthly split when the estimate drops below it, keeping the 0.5 h step.
 * Returns only the periods whose hours change; a split that still fits is left alone.
 */
export function scalePeriods(
  periods: { id: string; hours: number }[],
  estimate: number,
): { id: string; hours: number }[] {
  const total = periods.reduce((sum, period) => sum + period.hours, 0);
  if (total <= estimate + 1e-9 || total <= 0) return [];
  const factor = Math.max(0, estimate) / total;
  return periods
    .map((period) => ({
      id: period.id,
      hours: Math.floor(period.hours * factor * 2) / 2,
      was: period.hours,
    }))
    .filter((period) => !same(period.hours, period.was))
    .map(({ id, hours }) => ({ id, hours }));
}

/** Email-like unique name of an Azure identity field value, lower-cased. */
export function identityEmail(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const match = /<([^>]+)>$/.exec(value);
    return (match ? match[1] : value).trim().toLowerCase() || null;
  }
  if (typeof value === 'object') {
    const unique = (value as { uniqueName?: unknown }).uniqueName;
    return typeof unique === 'string' && unique.trim()
      ? unique.trim().toLowerCase()
      : null;
  }
  return null;
}

export function identityName(value: unknown): string | null {
  if (value && typeof value === 'object') {
    const name = (value as { displayName?: unknown }).displayName;
    if (typeof name === 'string' && name.trim()) return name.trim();
  }
  return identityEmail(value);
}

/** Azure stores Original Estimate as a number; anything else means "not set". */
export function hoursField(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
