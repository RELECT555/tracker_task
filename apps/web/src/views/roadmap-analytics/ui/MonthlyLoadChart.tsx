import { useId, useState } from 'react';
import { ColorMark } from '@/shared/ui/color-mark';
import { cn } from '@/shared/lib/utils';
import { formatHours, formatNumber, monthLabel, niceMax, type MonthColumn, type QuarterRef } from '../model/analytics';
import { AnalyticsPanel, EmptyState, type RoleLookup } from './analytics-ui';
import styles from './analytics.module.css';

const ticks = [0, 1, 2, 3, 4];
const compactNumber = new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 1 });

export function MonthlyLoadChart({ months, roles, quarter }: { months: MonthColumn[]; roles: RoleLookup; quarter: QuarterRef }) {
  const groupId = useId();
  const quarterStart = months.findIndex((month) => month.inQuarter);
  const quarterMonths = months.filter((month) => month.inQuarter);
  const defaultMonth = quarterMonths.reduce((peak, month) => month.total > peak.total ? month : peak, quarterMonths[0]);
  const [selectedKey, setSelectedKey] = useState(defaultMonth.monthKey);
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const activeMonth = months.find((month) => month.monthKey === (hoveredKey ?? selectedKey)) ?? defaultMonth;
  const yearTotal = months.reduce((total, month) => total + month.total, 0);
  const scaleMax = niceMax(Math.max(...months.map((month) => month.total)));
  const roleOrder = [...roles.keys()].filter((roleId) => months.some((month) => month.byRole.some((share) => share.roleId === roleId)));
  const tickLabel = scaleMax >= 10_000 ? compactNumber.format : formatNumber;

  return <AnalyticsPanel
    title="Загрузка по месяцам"
    description={`Запланированные часы · ${quarter.year}`}
    aside={<p className="rounded-md bg-muted/40 px-2.5 py-1.5 text-xs text-muted-foreground dark:bg-muted">За год <strong className="ml-1 font-semibold tabular-nums text-foreground">{formatHours(yearTotal)}</strong></p>}
  >
    {yearTotal > 0 ? <>
      <fieldset className={styles.chart} onPointerLeave={() => setHoveredKey(null)}>
        <legend className="sr-only">Месяц для детализации загрузки</legend>
        <div className={styles.axis} aria-hidden="true">
          {ticks.map((tick) => <span key={tick} style={{ bottom: `${tick * 25}%` }}>{tickLabel(scaleMax * tick / 4)}</span>)}
        </div>
        <div className={styles.plot} aria-hidden="true">
          <div className={styles.quarterBand} style={{ left: `${quarterStart / 12 * 100}%` }} />
          {ticks.map((tick) => <div key={tick} className="absolute inset-x-0 h-px bg-border/65" style={{ bottom: `${tick * 25}%` }} />)}
        </div>
        <div className={styles.months}>
          {months.map((month) => <label
            key={month.monthKey}
            className={cn(styles.month, month.inQuarter && styles.inQuarter, month === activeMonth && styles.activeMonth)}
            onPointerEnter={(event) => { if (event.pointerType === 'mouse') setHoveredKey(month.monthKey); }}
          >
            <input
              type="radio"
              name={groupId}
              className="sr-only"
              aria-label={`${monthLabel(month.monthKey, true)}, ${formatHours(month.total)}`}
              checked={selectedKey === month.monthKey}
              onChange={() => { setSelectedKey(month.monthKey); setHoveredKey(null); }}
            />
            <span className={styles.barTrack} aria-hidden="true">
              {month.inQuarter && month.total > 0 ? <span
                className={styles.barTotal}
                style={{ bottom: `min(100%, ${month.total / scaleMax * 100}%)` }}
              >{month.total >= 1000 ? compactNumber.format(month.total) : formatNumber(month.total)}</span> : null}
              {month.total > 0 ? <span className={styles.bar} style={{ height: `${month.total / scaleMax * 100}%` }}>
                {roleOrder.map((roleId) => {
                  const share = month.byRole.find((item) => item.roleId === roleId);
                  return share ? <span key={roleId} style={{ flexGrow: share.hours, backgroundColor: roles.get(roleId)?.color }} /> : null;
                })}
              </span> : <span className={styles.zeroBar} />}
            </span>
            <span className={styles.monthLabel} aria-hidden="true">{monthLabel(month.monthKey).slice(0, 3)}</span>
          </label>)}
        </div>
      </fieldset>

      <div className="mx-4 mb-4 mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-2 rounded-lg bg-muted/35 px-3 py-2.5 text-xs dark:bg-muted sm:mx-5 sm:mb-5" role="status">
        <p className="font-medium text-foreground">{monthLabel(activeMonth.monthKey, true)} <strong className="ml-1.5 font-semibold tabular-nums">{formatHours(activeMonth.total)}</strong></p>
        {roleOrder.length ? <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-muted-foreground" aria-label="Часы по ролям">
          {roleOrder.map((roleId) => {
            const role = roles.get(roleId);
            const hours = activeMonth.byRole.find((share) => share.roleId === roleId)?.hours ?? 0;
            return <li key={roleId} className="flex items-center gap-1.5">
              {role ? <ColorMark color={role.color} size="xs" /> : null}
              <span>{role?.name ?? 'Роль'} <strong className="ml-0.5 font-medium tabular-nums text-foreground">{formatHours(hours)}</strong></span>
            </li>;
          })}
        </ul> : null}
      </div>
    </> : <EmptyState>В {quarter.year} году нет часов, распределённых по месяцам.</EmptyState>}
  </AnalyticsPanel>;
}
