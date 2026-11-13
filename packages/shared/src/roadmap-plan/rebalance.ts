type Period = {
  monthKey?: string | null;
  label: string;
  startsAt: string;
  endsAt: string;
  hours: number | string;
};

type Allocation = {
  id: string;
  estimatedHours: number | string;
  periods: Period[];
};

export function rebalanceAllocations(allocations: Allocation[]) {
  if (allocations.length < 2) return null;
  const planned = new Map<string, { period: Period; cents: number }>();
  const shares = allocations.map(({ id }) => ({
    id,
    cents: 0,
    periods: [] as Period[],
  }));
  const totalEstimate = allocations.reduce(
    (sum, row) => sum + Math.round(Number(row.estimatedHours) * 100),
    0,
  );
  for (const { periods } of allocations) {
    for (const period of periods) {
      const key =
        period.monthKey ??
        JSON.stringify([
          period.label,
          period.startsAt.slice(0, 10),
          period.endsAt.slice(0, 10),
        ]);
      const entry = planned.get(key) ?? { period, cents: 0 };
      entry.cents += Math.round(Number(period.hours) * 100);
      planned.set(key, entry);
    }
  }

  let totalPlanned = 0;
  for (const { period, cents } of planned.values()) {
    const unit = period.monthKey ? 50 : 1;
    if (cents < 0 || cents % unit !== 0) return null;
    totalPlanned += cents;
    const units = cents / unit;
    const base = Math.floor(units / shares.length);
    const remainder = units % shares.length;
    const order = [...shares].sort((left, right) => left.cents - right.cents);
    order.forEach((share, index) => {
      const portion = (base + Number(index < remainder)) * unit;
      share.cents += portion;
      if (portion) share.periods.push({ ...period, hours: portion / 100 });
    });
  }
  if (totalPlanned > totalEstimate) return null;

  // Raise the smallest estimates first while keeping each estimate at least as large as its plan.
  let low = 0;
  let high = totalEstimate;
  while (low < high) {
    const level = Math.ceil((low + high) / 2);
    const total = shares.reduce(
      (sum, share) => sum + Math.max(share.cents, level),
      0,
    );
    if (total <= totalEstimate) low = level;
    else high = level - 1;
  }
  let rest =
    totalEstimate -
    shares.reduce((sum, share) => sum + Math.max(share.cents, low), 0);
  return shares.map(({ id, cents, periods }) => {
    const extra = cents <= low && rest > 0 ? 1 : 0;
    rest -= extra;
    return {
      id,
      estimatedHours: (Math.max(cents, low) + extra) / 100,
      periods,
    };
  });
}
