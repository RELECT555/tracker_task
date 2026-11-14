import { useId, useState } from 'react';
import { ColorMark } from '@/shared/ui/color-mark';
import { formatHours, monthLabel, type MonthColumn, type QuarterRef } from '../model/analytics';
import { AnalyticsPanel, EmptyState, type RoleLookup } from './analytics-ui';

export function MonthlyLoadChart({ months, roles, quarter }: { months: MonthColumn[]; roles: RoleLookup; quarter: QuarterRef }) {
  const groupId = useId();
  const [selectedKey, setSelectedKey] = useState<string>();
  const peakMonth = months.reduce((peak, month) => month.total > peak.total ? month : peak);
  const activeMonth = months.find((month) => month.monthKey === selectedKey) ?? peakMonth;
  const total = months.reduce((sum, month) => sum + month.total, 0);

  return <AnalyticsPanel title="Загрузка по месяцам" description={`${quarter.label} · ${formatHours(total)}`}>
    {peakMonth.total > 0 ? <>
      <fieldset className="mx-4 space-y-1 sm:mx-5">
        <legend className="sr-only">Месяц для детализации загрузки</legend>
        {months.map((month) => <label
          key={month.monthKey}
          className="grid cursor-pointer grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2 py-2 text-sm hover:bg-muted/40 has-[:checked]:bg-muted/60 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring sm:grid-cols-[5rem_minmax(0,1fr)_auto] sm:gap-3"
        >
          <input
            type="radio"
            name={groupId}
            className="sr-only"
            aria-label={`${monthLabel(month.monthKey, true)}, ${formatHours(month.total)}`}
            checked={activeMonth === month}
            onChange={() => setSelectedKey(month.monthKey)}
          />
          <span className="text-xs font-medium text-foreground sm:text-sm" aria-hidden="true">{monthLabel(month.monthKey)}</span>
          <span className="flex h-2 overflow-hidden rounded-full bg-muted" aria-hidden="true">
            <span className="flex h-full overflow-hidden rounded-full" style={{ width: `${month.total / peakMonth.total * 100}%` }}>
              {month.byRole.map(({ roleId, hours }) => <span key={roleId} className="bg-primary" style={{ flexGrow: hours, backgroundColor: roles.get(roleId)?.color }} />)}
            </span>
          </span>
          <span className="min-w-14 text-right text-xs font-semibold tabular-nums text-foreground sm:min-w-20 sm:text-sm" aria-hidden="true">{formatHours(month.total)}</span>
        </label>)}
      </fieldset>
      <div className="mx-4 mb-4 mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground sm:mx-5 sm:mb-5" role="status">
        {activeMonth.byRole.length ? <ul className="flex flex-wrap gap-x-4 gap-y-1.5" aria-label={`Часы по ролям · ${monthLabel(activeMonth.monthKey, true)}`}>
          {activeMonth.byRole.map(({ roleId, hours }) => {
            const role = roles.get(roleId);
            return <li key={roleId} className="flex min-w-0 items-center gap-1.5">
              {role ? <ColorMark color={role.color} size="xs" /> : null}
              <span className="wrap-anywhere">{role?.name ?? 'Роль'} <strong className="ml-0.5 whitespace-nowrap font-medium tabular-nums text-foreground">{formatHours(hours)}</strong></span>
            </li>;
          })}
        </ul> : <p>На этот месяц часы не запланированы.</p>}
      </div>
    </> : <EmptyState>Часы по месяцам ещё не распределены.</EmptyState>}
  </AnalyticsPanel>;
}
