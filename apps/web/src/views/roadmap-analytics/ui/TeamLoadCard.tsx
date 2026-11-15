import { useState } from 'react';
import { ColorMark } from '@/shared/ui/color-mark';
import { cn } from '@/shared/lib/utils';
import { formatNumber, monthLabel, type PersonRow, type QuarterRef } from '../model/analytics';
import { AnalyticsPanel, EmptyState, ExpandButton, plural, type RoleLookup } from './analytics-ui';
import styles from './analytics.module.css';

const previewCount = 8;

function Hours({ value }: { value: number }) {
  return value ? <>{formatNumber(value)}</> : <><span className="text-muted-foreground/70" aria-hidden="true">—</span><span className="sr-only">0</span></>;
}

/** Люди × месяцы квартала; строка итогов заменяет отдельный график «по месяцам». */
export function TeamLoadCard({ people, roles, quarter }: { people: PersonRow[]; roles: RoleLookup; quarter: QuarterRef }) {
  const [showAll, setShowAll] = useState(false);
  const maxCell = Math.max(1, ...people.flatMap((person) => person.months));
  const visible = showAll ? people : people.slice(0, previewCount);
  const monthTotals = quarter.monthKeys.map((_, index) => people.reduce((sum, person) => sum + person.months[index], 0));
  const total = monthTotals.reduce((sum, hours) => sum + hours, 0);

  return <AnalyticsPanel title="Загрузка команды" description={`${people.length} ${plural(people.length, 'участник', 'участника', 'участников')} · ${quarter.label} · часы по месяцам`}>
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
              <span className="block rounded-md px-1 py-1 text-foreground" style={{ backgroundColor: hours ? `hsl(var(--primary) / ${0.07 + hours / maxCell * 0.23})` : undefined }}>
                <Hours value={hours} />
              </span>
            </td>)}
            <td role="cell">
              <span className={styles.inlineLabel} aria-hidden="true">Итого, ч</span>
              <p className="font-semibold text-foreground"><Hours value={person.total} /></p>
              {Math.abs(person.estimate - person.total) >= 0.5 ? <p className="mt-0.5 text-xs text-muted-foreground">Оценка {formatNumber(person.estimate)}</p> : null}
            </td>
          </tr>)}
        </tbody>
        <tfoot role="rowgroup">
          <tr role="row">
            <th scope="row" role="rowheader">Вся команда</th>
            {monthTotals.map((hours, index) => <td key={quarter.monthKeys[index]} role="cell"><span className={styles.inlineLabel} aria-hidden="true">{monthLabel(quarter.monthKeys[index])}</span><Hours value={hours} /></td>)}
            <td role="cell"><span className={styles.inlineLabel} aria-hidden="true">Итого, ч</span><Hours value={total} /></td>
          </tr>
        </tfoot>
      </table>
      {people.length > previewCount ? <ExpandButton expanded={showAll} hidden={people.length - previewCount} onToggle={() => setShowAll((value) => !value)} /> : null}
    </> : <EmptyState>На {quarter.label} никто не назначен.</EmptyState>}
  </AnalyticsPanel>;
}
