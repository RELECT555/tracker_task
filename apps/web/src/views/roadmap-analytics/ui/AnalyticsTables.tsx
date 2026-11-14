import { useState } from 'react';
import { ExternalLink, TrendingUp } from 'lucide-react';
import { AzureWorkItemIcon } from '@/entities/roadmap/ui/AzureWorkItemIcon';
import { Button } from '@/shared/ui/button';
import { ColorMark } from '@/shared/ui/color-mark';
import { cn } from '@/shared/lib/utils';
import { formatHours, formatNumber, formatPercent, monthLabel, statusGroupLabels, type EpicRow, type PersonRow, type QuarterRef } from '../model/analytics';
import { AnalyticsPanel, EmptyState, Meter, plural, statusStyles, type RoleLookup } from './analytics-ui';
import styles from './analytics.module.css';

export function TeamLoadCard({ people, roles, quarter }: { people: PersonRow[]; roles: RoleLookup; quarter: QuarterRef }) {
  const [showAll, setShowAll] = useState(false);
  const maxCell = Math.max(1, ...people.flatMap((person) => person.months));
  const visible = showAll ? people : people.slice(0, 8);
  const monthTotals = quarter.monthKeys.map((_, index) => people.reduce((sum, person) => sum + person.months[index], 0));

  return <AnalyticsPanel title="Загрузка команды" description={`${people.length} ${plural(people.length, 'участник', 'участника', 'участников')} · ${quarter.label}`}>
    {people.length ? <>
      <table className={cn(styles.table, styles.teamTable)} role="table" aria-label="Часы участников по месяцам квартала">
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">Участник</th>
            {quarter.monthKeys.map((key) => <th key={key} scope="col" role="columnheader">{monthLabel(key)}</th>)}
            <th scope="col" role="columnheader">Итого, ч</th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {visible.map((person) => <tr key={person.id} role="row">
            <th scope="row" role="rowheader">
              <p className="font-medium text-foreground">{person.name}</p>
              <ul className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-normal text-muted-foreground">
                {person.roleIds.flatMap((id) => {
                  const role = roles.get(id);
                  return role ? [<li key={id} className="inline-flex items-center gap-1.5"><ColorMark color={role.color} size="xs" />{role.name}</li>] : [];
                })}
                <li>{person.features} {plural(person.features, 'фича', 'фичи', 'фич')}</li>
              </ul>
            </th>
            {person.months.map((hours, index) => <td key={quarter.monthKeys[index]} role="cell">
              <span className={styles.inlineLabel} aria-hidden="true">{monthLabel(quarter.monthKeys[index])}</span>
              <span className={cn('block rounded-md px-1 py-1', hours ? 'text-foreground' : 'text-muted-foreground')} style={{ backgroundColor: hours ? `hsl(var(--primary) / ${0.07 + hours / maxCell * 0.23})` : undefined }}>
                {formatNumber(hours)}
              </span>
            </td>)}
            <td role="cell">
              <span className={styles.inlineLabel} aria-hidden="true">Итого, ч</span>
              <p className="font-semibold text-foreground">{formatNumber(person.total)}</p>
              {Math.abs(person.estimate - person.total) >= 0.5 ? <p className="mt-0.5 text-xs text-muted-foreground">Оценка {formatNumber(person.estimate)}</p> : null}
            </td>
          </tr>)}
        </tbody>
        <tfoot role="rowgroup">
          <tr role="row">
            <th scope="row" role="rowheader">Вся команда</th>
            {monthTotals.map((hours, index) => <td key={quarter.monthKeys[index]} role="cell"><span className={styles.inlineLabel} aria-hidden="true">{monthLabel(quarter.monthKeys[index])}</span>{formatNumber(hours)}</td>)}
            <td role="cell"><span className={styles.inlineLabel} aria-hidden="true">Итого, ч</span>{formatNumber(monthTotals.reduce((sum, hours) => sum + hours, 0))}</td>
          </tr>
        </tfoot>
      </table>
      {people.length > 8 ? <div className="border-t border-border/60 px-3 py-1.5 sm:px-4">
        <Button type="button" variant="ghost" size="sm" aria-expanded={showAll} onClick={() => setShowAll((value) => !value)} className="text-foreground">{showAll ? 'Свернуть список' : `Показать всех (${people.length})`}</Button>
      </div> : null}
    </> : <EmptyState>На {quarter.label} никто не назначен.</EmptyState>}
  </AnalyticsPanel>;
}

export function EpicsCard({ rows, roles, quarter }: { rows: EpicRow[]; roles: RoleLookup; quarter: QuarterRef }) {
  const planLabel = `План ${quarter.label}`;
  return <AnalyticsPanel title="Эпики" description="Готовность фич и часы по эпикам">
    {rows.length ? <table className={cn(styles.table, styles.epicsTable)} role="table" aria-label="Готовность, план и факт по эпикам">
      <thead role="rowgroup">
        <tr role="row">
          {['Эпик', 'Готовность', planLabel, 'Оценка всего', 'Факт', 'Роли в квартале'].map((label) => <th key={label} scope="col" role="columnheader">{label}</th>)}
        </tr>
      </thead>
      <tbody role="rowgroup">
        {rows.map((row) => {
          const shares = [...roles.keys()].flatMap((roleId) => row.byRole.filter((share) => share.roleId === roleId));
          const isEpic = row.id !== 'no-epic';
          const StateIcon = statusStyles[row.group].icon;
          const overrun = row.estimate > 0 && row.actual > row.estimate;
          return <tr key={row.id} role="row">
            <th scope="row" role="rowheader">
              <div className="flex items-baseline gap-2 break-words font-medium">
                {isEpic ? <AzureWorkItemIcon type="Epic" /> : null}
                {row.url ? <a href={row.url} target="_blank" rel="noreferrer" aria-label={`Открыть «${row.title}» в Azure DevOps`} className="min-w-0 rounded-sm hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                  {row.title} <ExternalLink className="inline size-3 text-muted-foreground" aria-hidden="true" />
                </a> : <span className="min-w-0">{row.title}</span>}
              </div>
              {isEpic ? <p className="mt-1.5 flex items-center gap-1.5 text-xs font-normal text-muted-foreground">
                <StateIcon className="size-3.5 shrink-0" style={{ color: statusStyles[row.group].color }} aria-hidden="true" />{row.state?.trim() || statusGroupLabels[row.group]}
              </p> : null}
            </th>
            <td role="cell">
              <span className={styles.inlineLabel} aria-hidden="true">Готовность</span>
              {row.features ? <>
                <p className="mb-1.5 flex flex-wrap items-baseline gap-x-2 text-xs">
                  <strong className="font-semibold">{formatPercent(row.done, row.features)}</strong>
                  <span className="text-muted-foreground">{row.done} из {row.features}</span>
                </p>
                <Meter value={row.done / row.features} color={statusStyles.done.color} label={`Готовность эпика «${row.title}»`} />
              </> : <span className="text-xs text-muted-foreground">Нет фич</span>}
            </td>
            <td role="cell"><span className={styles.inlineLabel} aria-hidden="true">План</span><strong className="font-semibold">{formatHours(row.quarterHours)}</strong></td>
            <td role="cell"><span className={styles.inlineLabel} aria-hidden="true">Оценка</span>{formatHours(row.estimate)}</td>
            <td role="cell">
              <span className={styles.inlineLabel} aria-hidden="true">Факт</span>{formatHours(row.actual)}
              {row.actual && row.estimate ? <p className={cn('mt-0.5 text-xs', overrun ? 'font-medium text-red-700 dark:text-red-300' : 'text-muted-foreground')}>
                {overrun ? <TrendingUp className="mr-1 inline size-3" aria-hidden="true" /> : null}{formatPercent(row.actual, row.estimate)} от оценки
              </p> : null}
            </td>
            <td role="cell">
              <span className={styles.inlineLabel} aria-hidden="true">Роли в квартале</span>
              {shares.length ? <>
                <div className="mb-2 flex h-1.5 overflow-hidden rounded-full" aria-hidden="true">
                  {shares.map((share) => <span key={share.roleId} style={{ flexGrow: share.hours, backgroundColor: roles.get(share.roleId)?.color }} />)}
                </div>
                <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Часы по ролям">
                  {shares.map((share) => <li key={share.roleId}>{roles.get(share.roleId)?.name} <span className="tabular-nums text-foreground">{formatHours(share.hours)}</span></li>)}
                </ul>
              </> : <span className="text-xs text-muted-foreground">Нет часов</span>}
            </td>
          </tr>;
        })}
      </tbody>
    </table> : <EmptyState>В проекте пока нет эпиков и фич.</EmptyState>}
  </AnalyticsPanel>;
}
