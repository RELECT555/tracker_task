import { useState, type CSSProperties } from 'react';
import { TriangleAlert } from 'lucide-react';
import { ColorMark } from '@/shared/ui/color-mark';
import { cn } from '@/shared/lib/utils';
import { formatNumber, formatPercent, highLoadThreshold, loadLevel, monthLabel, type LoadLevel, type PersonRow, type QuarterRef } from '../model/analytics';
import { AnalyticsPanel, EmptyState, ExpandButton, plural, type RoleLookup } from './analytics-ui';
import styles from './analytics.module.css';

const previewCount = 8;

const levelClass: Record<LoadLevel, string | undefined> = {
  none: undefined,
  normal: styles.loadNormal,
  high: styles.loadHigh,
  over: styles.loadOver,
};

const levelLabel: Record<Exclude<LoadLevel, 'none'>, string> = {
  normal: 'в пределах нормы',
  high: 'высокая загрузка',
  over: 'перегруз',
};

/** Часы и доля нормы; цвет ячейки — уровень загрузки, перегруз дополнительно помечен иконкой. */
function LoadCell({ hours, capacity, context, strong }: { hours: number; capacity: number; context: string; strong?: boolean }) {
  const level = loadLevel(hours, capacity);
  if (level === 'none') return <span className={styles.loadCell}><span className="text-muted-foreground/70" aria-hidden="true">—</span><span className="sr-only">0</span></span>;
  const share = formatPercent(hours, capacity);
  return <span
    className={cn(styles.loadCell, levelClass[level])}
    style={level === 'normal' ? { '--load': Math.min(1, hours / capacity) } as CSSProperties : undefined}
    title={`${context}: ${formatNumber(hours)} ч из ${formatNumber(capacity)} ч нормы (${share}) — ${levelLabel[level]}`}
  >
    <span className={cn('block text-foreground', strong && 'font-semibold')}>{formatNumber(hours)}</span>
    <span className={styles.loadShare}>
      {level === 'over' ? <TriangleAlert className={styles.loadIcon} aria-hidden="true" /> : null}
      {share}<span className="sr-only"> нормы, {levelLabel[level]}</span>
    </span>
  </span>;
}

function LoadLegend({ quarter, monthNorms }: { quarter: QuarterRef; monthNorms: number[] }) {
  const swatches = [
    { className: styles.loadNormal, label: `до ${Math.round(highLoadThreshold * 100)}%` },
    { className: styles.loadHigh, label: `${Math.round(highLoadThreshold * 100)}–100%` },
    { className: styles.loadOver, label: 'больше 100%', icon: true },
  ];
  return <div className="space-y-2 border-t border-border/55 px-4 py-3 text-xs text-muted-foreground sm:px-5">
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Уровни загрузки">
      {swatches.map((swatch) => <li key={swatch.label} className="inline-flex items-center gap-1.5">
        <span className={cn(styles.loadSwatch, swatch.className)} style={{ '--load': 0.6 } as CSSProperties} aria-hidden="true" />
        {swatch.icon ? <TriangleAlert className={styles.loadIcon} aria-hidden="true" /> : null}{swatch.label}
      </li>)}
    </ul>
    <p className="leading-relaxed">
      Норма — рабочие дни × 8 ч: {quarter.monthKeys.map((key, index) => `${monthLabel(key)} ${formatNumber(monthNorms[index])} ч`).join(' · ')}.
      Учитываются только часы этого проекта, праздники пока не вычитаются.
    </p>
  </div>;
}

/** Люди × месяцы квартала: часы и доля месячной нормы; строка итогов — загрузка всей команды. */
export function TeamLoadCard({ people, roles, quarter, monthNorms, overloaded }: {
  people: PersonRow[];
  roles: RoleLookup;
  quarter: QuarterRef;
  monthNorms: number[];
  overloaded: number;
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? people : people.slice(0, previewCount);
  const personNorm = monthNorms.reduce((sum, hours) => sum + hours, 0);
  const monthTotals = quarter.monthKeys.map((_, index) => people.reduce((sum, person) => sum + person.months[index], 0));
  const total = monthTotals.reduce((sum, hours) => sum + hours, 0);
  const summary = [
    `${people.length} ${plural(people.length, 'участник', 'участника', 'участников')}`,
    quarter.label,
    overloaded ? `${overloaded} с перегрузом` : 'часы и доля нормы',
  ].join(' · ');

  return <AnalyticsPanel title="Загрузка команды" description={summary}>
    {people.length ? <>
      <table className={cn(styles.table, styles.teamTable)} role="table" aria-label="Часы участников и доля месячной нормы">
        <thead role="rowgroup">
          <tr role="row">
            <th scope="col" role="columnheader">Участник</th>
            {quarter.monthKeys.map((key, index) => <th key={key} scope="col" role="columnheader">
              {monthLabel(key)}<span className="block text-[11px] font-normal tabular-nums text-muted-foreground/80">норма {formatNumber(monthNorms[index])}</span>
            </th>)}
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
              <LoadCell hours={hours} capacity={monthNorms[index]} context={`${person.name}, ${monthLabel(quarter.monthKeys[index], true)}`} />
            </td>)}
            <td role="cell">
              <span className={styles.inlineLabel} aria-hidden="true">Итого, ч</span>
              <LoadCell hours={person.total} capacity={personNorm} context={`${person.name}, ${quarter.label}`} strong />
              {Math.abs(person.estimate - person.total) >= 0.5 ? <p className="mt-0.5 text-xs text-muted-foreground">Оценка {formatNumber(person.estimate)}</p> : null}
            </td>
          </tr>)}
        </tbody>
        <tfoot role="rowgroup">
          <tr role="row">
            <th scope="row" role="rowheader">Вся команда</th>
            {monthTotals.map((hours, index) => <td key={quarter.monthKeys[index]} role="cell">
              <span className={styles.inlineLabel} aria-hidden="true">{monthLabel(quarter.monthKeys[index])}</span>
              <LoadCell hours={hours} capacity={monthNorms[index] * people.length} context={`Команда, ${monthLabel(quarter.monthKeys[index], true)}`} strong />
            </td>)}
            <td role="cell">
              <span className={styles.inlineLabel} aria-hidden="true">Итого, ч</span>
              <LoadCell hours={total} capacity={personNorm * people.length} context={`Команда, ${quarter.label}`} strong />
            </td>
          </tr>
        </tfoot>
      </table>
      {people.length > previewCount ? <ExpandButton expanded={showAll} hidden={people.length - previewCount} onToggle={() => setShowAll((value) => !value)} /> : null}
      <LoadLegend quarter={quarter} monthNorms={monthNorms} />
    </> : <EmptyState>На {quarter.label} никто не назначен.</EmptyState>}
  </AnalyticsPanel>;
}
