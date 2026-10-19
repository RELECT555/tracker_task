'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ChevronLeft, ChevronRight, Circle, CircleCheck, CircleDot, CircleX, ExternalLink, TrendingUp, UserX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { roadmapApi } from '@/entities/roadmap/api/roadmapApi';
import type { RoadmapRole } from '@/entities/roadmap/api/roadmapApi';
import { AzureProjectPicker } from '@/entities/roadmap/ui/AzureProjectPicker';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ColorMark } from '@/shared/ui/color-mark';
import { cn } from '@/shared/lib/utils';
import {
  buildAnalytics, currentQuarterRef, formatHours, formatNumber, formatPercent, monthLabel, niceMax, percent, shiftQuarter, statusGroupLabels,
} from '../model/analytics';
import type { AttentionItem, EpicRow, MonthColumn, PersonRow, QuarterRef, RoadmapAnalytics, RoleRow, RoleShare, StatusGroup } from '../model/analytics';

type RoleLookup = Map<string, Pick<RoadmapRole, 'id' | 'name' | 'color'>>;

// Цвета статусов зарезервированы за состоянием и всегда идут вместе с иконкой и подписью.
const statusStyles: Record<StatusGroup, { color: string; icon: LucideIcon }> = {
  done: { color: '#0ca30c', icon: CircleCheck },
  active: { color: 'hsl(var(--primary))', icon: CircleDot },
  new: { color: 'hsl(var(--muted-foreground) / 0.5)', icon: Circle },
  removed: { color: 'hsl(var(--muted-foreground) / 0.22)', icon: CircleX },
};

function SectionCard({ title, description, aside, children, className }: { title: string; description?: ReactNode; aside?: ReactNode; children: ReactNode; className?: string }) {
  return <Card className={cn('flex min-w-0 flex-col', className)}>
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3 pt-5">
      <div className="min-w-0"><h2 className="text-base font-semibold tracking-tight text-foreground">{title}</h2>{description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}</div>
      {aside}
    </div>
    <div className="min-w-0 flex-1 px-5 pb-5">{children}</div>
  </Card>;
}

function Meter({ value, color = 'hsl(var(--primary))', label }: { value: number; color?: string; label: string }) {
  const clamped = Math.max(0, Math.min(1, value));
  return <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(clamped * 100)} className="h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)` }}>
    <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${clamped * 100}%`, backgroundColor: color }} />
  </div>;
}

function StatTile({ label, value, note, meter }: { label: string; value: ReactNode; note: ReactNode; meter?: { value: number; color?: string } }) {
  return <Card className="flex flex-col p-4 sm:p-5">
    <p className="text-sm font-medium text-muted-foreground">{label}</p>
    <p className="mt-2 text-[28px] font-semibold leading-tight tracking-tight text-foreground">{value}</p>
    {meter ? <div className="mt-3"><Meter value={meter.value} color={meter.color} label={label} /></div> : null}
    <p className="mt-auto pt-3 text-xs leading-relaxed text-muted-foreground">{note}</p>
  </Card>;
}

function QuarterSwitcher({ quarter, onShift }: { quarter: QuarterRef; onShift: (offset: number) => void }) {
  return <div className="flex h-9 items-center gap-1 rounded-lg border border-border bg-card p-0.5">
    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Предыдущий квартал" onClick={() => onShift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
    <span className="min-w-20 text-center text-sm font-semibold tabular-nums">{quarter.label}</span>
    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Следующий квартал" onClick={() => onShift(1)}><ChevronRight className="h-4 w-4" /></Button>
  </div>;
}

function RoleLegend({ roleIds, roles }: { roleIds: string[]; roles: RoleLookup }) {
  return <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5" aria-label="Роли">
    {roleIds.map((id) => roles.get(id)).filter(Boolean).map((role) => <li key={role!.id} className="flex items-center gap-2 text-xs text-muted-foreground"><ColorMark color={role!.color} size="sm" />{role!.name}</li>)}
  </ul>;
}

function RoleBreakdown({ shares, roles, total }: { shares: RoleShare[]; roles: RoleLookup; total: number }) {
  return <div className="space-y-1.5">
    {shares.map((share) => {
      const role = roles.get(share.roleId);
      return <div key={share.roleId} className="flex items-center gap-2 text-xs"><ColorMark color={role?.color ?? '#94a3b8'} size="sm" /><span className="min-w-0 flex-1 truncate text-muted-foreground">{role?.name ?? 'Роль'}</span><span className="tabular-nums text-foreground">{formatHours(share.hours)}</span></div>;
    })}
    <div className="flex items-center justify-between border-t border-border pt-1.5 text-xs font-semibold text-foreground"><span>Всего</span><span className="tabular-nums">{formatHours(total)}</span></div>
  </div>;
}

function MonthlyLoadChart({ months, roles, roleOrder, quarter }: { months: MonthColumn[]; roles: RoleLookup; roleOrder: string[]; quarter: QuarterRef }) {
  const [active, setActive] = useState<number | null>(null);
  const plotHeight = 260;
  const scaleMax = niceMax(Math.max(0, ...months.map((month) => month.total)));
  const quarterStart = months.findIndex((month) => month.inQuarter);
  const usedRoles = roleOrder.filter((id) => months.some((month) => month.byRole.some((share) => share.roleId === id)));
  const yearTotal = months.reduce((sum, month) => sum + month.total, 0);
  const activeMonth = active === null ? null : months[active];

  return <SectionCard
    title={`Загрузка по месяцам · ${quarter.year}`}
    description={`Часы назначений, разложенные по месяцам. Всего за год ${formatHours(yearTotal)}`}
    aside={usedRoles.length > 1 ? <RoleLegend roleIds={usedRoles} roles={roles} /> : null}
  >
    {yearTotal ? <div className="relative pt-6">
      <div className="flex">
        <div className="relative w-10 shrink-0" style={{ height: plotHeight }} aria-hidden="true">
          {[0, 1, 2, 3, 4].map((tick) => <span key={tick} className="absolute right-2 translate-y-1/2 text-[11px] tabular-nums text-muted-foreground" style={{ bottom: (plotHeight * tick) / 4 }}>{formatNumber((scaleMax * tick) / 4)}</span>)}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height: plotHeight }}>
          {[0, 1, 2, 3, 4].map((tick) => <div key={tick} aria-hidden="true" className={cn('absolute inset-x-0 h-px', tick ? 'bg-border/60' : 'bg-border')} style={{ bottom: (plotHeight * tick) / 4 }} />)}
          {quarterStart >= 0 ? <div aria-hidden="true" className="absolute -top-6 bottom-0 rounded-lg bg-primary/[0.06]" style={{ left: `${(quarterStart / 12) * 100}%`, width: '25%' }}>
            <span className="absolute left-2 top-1 text-[10px] font-semibold uppercase tracking-wide text-primary">{quarter.label}</span>
          </div> : null}
          <div className="absolute inset-0 grid grid-cols-12" onMouseLeave={() => setActive(null)}>
            {months.map((month, index) => {
              const ordered = roleOrder.map((id) => month.byRole.find((share) => share.roleId === id)).filter((share): share is RoleShare => Boolean(share));
              return <div
                key={month.monthKey}
                tabIndex={0}
                role="img"
                aria-label={`${monthLabel(month.monthKey, true)}: ${formatHours(month.total)}`}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onBlur={() => setActive(null)}
                className={cn('relative flex h-full flex-col items-center justify-end rounded-md outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring', active === index && 'bg-foreground/[0.04]', !month.inQuarter && 'opacity-45')}
              >
                {month.total && (month.inQuarter || active === index) ? <span className="mb-1 text-[11px] font-semibold tabular-nums text-foreground">{formatNumber(month.total)}</span> : null}
                {month.total ? <div className="flex w-full max-w-6 flex-col-reverse gap-[2px] overflow-hidden rounded-t-[4px]">
                  {ordered.map((share, shareIndex) => <div key={share.roleId} style={{ height: Math.max(2, (share.hours / scaleMax) * plotHeight - (shareIndex ? 2 : 0)), backgroundColor: roles.get(share.roleId)?.color ?? '#94a3b8' }} />)}
                </div> : null}
              </div>;
            })}
          </div>
          {activeMonth && activeMonth.total ? <div
            className="pointer-events-none absolute z-10 w-52 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-lg"
            style={{ bottom: Math.min(plotHeight - 40, (activeMonth.total / scaleMax) * plotHeight + 12), ...(active! < 7 ? { left: `calc(${((active! + 1) / 12) * 100}% + 4px)` } : { right: `calc(${((12 - active!) / 12) * 100}% + 4px)` }) }}
          >
            <p className="mb-2 text-xs font-semibold text-foreground">{monthLabel(activeMonth.monthKey, true)}</p>
            <RoleBreakdown shares={roleOrder.map((id) => activeMonth.byRole.find((share) => share.roleId === id)).filter((share): share is RoleShare => Boolean(share))} roles={roles} total={activeMonth.total} />
          </div> : null}
        </div>
      </div>
      <div className="mt-2 grid grid-cols-12 pl-10" aria-hidden="true">
        {months.map((month) => <span key={month.monthKey} className={cn('text-center text-[11px]', month.inQuarter ? 'font-medium text-foreground' : 'text-muted-foreground')}>{monthLabel(month.monthKey)}</span>)}
      </div>
    </div> : <EmptyState text={`В ${quarter.year} году нет часов, разложенных по месяцам.`} />}
  </SectionCard>;
}

const attentionKinds: Record<AttentionItem['kind'], { label: string; icon: LucideIcon }> = {
  unassigned: { label: 'Без назначений', icon: UserX },
  unspread: { label: 'Не разложено', icon: CalendarClock },
  overrun: { label: 'Перерасход', icon: TrendingUp },
};

function AttentionCard({ items, quarter }: { items: AttentionItem[]; quarter: QuarterRef }) {
  const [selectedFilter, setFilter] = useState<AttentionItem['kind'] | 'all'>('all');
  const [expanded, setExpanded] = useState(false);
  const kinds = (Object.keys(attentionKinds) as AttentionItem['kind'][]).map((kind) => ({ kind, count: items.filter((item) => item.kind === kind).length })).filter((entry) => entry.count);
  const filter = kinds.some((entry) => entry.kind === selectedFilter) ? selectedFilter : 'all';
  const filtered = filter === 'all' ? items : items.filter((item) => item.kind === filter);
  const visible = expanded ? filtered : filtered.slice(0, 6);

  return <SectionCard title="Требует внимания" description={items.length ? `${items.length} ${plural(items.length, 'пункт', 'пункта', 'пунктов')} по плану ${quarter.label}` : `План ${quarter.label} без замечаний`}>
    {items.length ? <>
      {kinds.length > 1 ? <div className="mb-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Тип замечания">
        {[{ kind: 'all' as const, count: items.length }, ...kinds].map((entry) => <button key={entry.kind} type="button" role="tab" aria-selected={filter === entry.kind} onClick={() => { setFilter(entry.kind); setExpanded(false); }} className={cn('inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition-colors', filter === entry.kind ? 'border-primary/40 bg-primary/10 font-medium text-foreground' : 'border-border text-muted-foreground hover:bg-muted hover:text-foreground')}>
          {entry.kind === 'all' ? 'Все' : attentionKinds[entry.kind].label}<span className="tabular-nums text-muted-foreground">{entry.count}</span>
        </button>)}
      </div> : null}
      <ul className="divide-y divide-border/70">
        {visible.map((item) => {
          const Icon = attentionKinds[item.kind].icon;
          return <li key={item.id} className="flex items-start gap-3 py-2.5">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-300"><Icon className="h-4 w-4" strokeWidth={1.8} /></span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground" title={item.title}>{item.title}</p>
              <p className="text-xs text-muted-foreground"><span className="font-medium text-foreground/80">{attentionKinds[item.kind].label}</span> · {item.detail}</p>
            </div>
            {item.url ? <a href={item.url} target="_blank" rel="noreferrer" aria-label={`Открыть «${item.title}» в Azure DevOps`} className="mt-1 text-muted-foreground transition-colors hover:text-foreground"><ExternalLink className="h-4 w-4" /></a> : null}
          </li>;
        })}
      </ul>
      {filtered.length > 6 ? <button type="button" onClick={() => setExpanded((value) => !value)} className="mt-2 text-xs font-medium text-primary hover:underline">{expanded ? 'Свернуть' : `Показать ещё ${filtered.length - 6}`}</button> : null}
    </> : <div className="flex flex-col items-center gap-2 py-10 text-center">
      <CircleCheck className="h-8 w-8 text-[#0ca30c]" strokeWidth={1.6} />
      <p className="text-sm font-medium text-foreground">Всё в порядке</p>
      <p className="max-w-64 text-xs text-muted-foreground">У открытых фич есть назначения, оценки разложены по месяцам, перерасхода нет.</p>
    </div>}
  </SectionCard>;
}

function initials(name: string) {
  return name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
}

function TeamLoadCard({ people, roles, quarter }: { people: PersonRow[]; roles: RoleLookup; quarter: QuarterRef }) {
  const [showAll, setShowAll] = useState(false);
  const maxCell = Math.max(1, ...people.flatMap((person) => person.months));
  const maxTotal = Math.max(1, ...people.map((person) => person.total));
  const visible = showAll ? people : people.slice(0, 8);
  const monthTotals = quarter.monthKeys.map((_, index) => people.reduce((sum, person) => sum + person.months[index], 0));

  return <SectionCard title="Загрузка команды" description={`Часы по месяцам ${quarter.label}. Чем насыщеннее ячейка, тем выше загрузка`}>
    {people.length ? <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-5 pb-2 font-medium">Участник</th>
            {quarter.monthKeys.map((monthKey) => <th key={monthKey} scope="col" className="w-20 px-1 pb-2 text-center font-medium">{monthLabel(monthKey)}</th>)}
            <th scope="col" className="w-40 px-5 pb-2 text-right font-medium">Итого</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((person) => <tr key={person.id} className="border-t border-border/60">
            <td className="px-5 py-2">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-foreground">{initials(person.name)}</span>
                <div className="min-w-0">
                  <p className="truncate font-medium text-foreground">{person.name}</p>
                  <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
                    {person.roleIds.map((id) => roles.get(id)).filter(Boolean).map((role) => <span key={role!.id} className="inline-flex items-center gap-1"><ColorMark color={role!.color} size="xs" />{role!.name}</span>)}
                    <span>· {person.features} {plural(person.features, 'фича', 'фичи', 'фич')}</span>
                  </p>
                </div>
              </div>
            </td>
            {person.months.map((hours, index) => {
              const ratio = hours / maxCell;
              return <td key={quarter.monthKeys[index]} className="px-1 py-2">
                <div title={`${person.name} · ${monthLabel(quarter.monthKeys[index], true)}: ${formatHours(hours)}`} className={cn('flex h-9 items-center justify-center rounded-md text-xs font-medium tabular-nums', !hours ? 'text-muted-foreground/60' : ratio > 0.6 ? 'text-primary-foreground' : 'text-foreground')} style={{ backgroundColor: hours ? `hsl(var(--primary) / ${0.1 + ratio * 0.75})` : 'hsl(var(--muted) / 0.5)' }}>
                  {hours ? formatNumber(hours) : '—'}
                </div>
              </td>;
            })}
            <td className="px-5 py-2 text-right">
              <p className="font-semibold tabular-nums text-foreground">{formatHours(person.total)}</p>
              <div className="ml-auto mt-1 h-1 w-full max-w-28 overflow-hidden rounded-full bg-muted"><div className="ml-auto h-full rounded-full bg-primary" style={{ width: `${(person.total / maxTotal) * 100}%` }} /></div>
              {Math.abs(person.estimate - person.total) >= 0.5 ? <p className="mt-1 text-[11px] text-muted-foreground">оценка {formatHours(person.estimate)}</p> : null}
            </td>
          </tr>)}
        </tbody>
        <tfoot>
          <tr className="border-t border-border text-xs font-semibold text-foreground">
            <td className="px-5 pt-2.5">Вся команда · {people.length} {plural(people.length, 'человек', 'человека', 'человек')}</td>
            {monthTotals.map((hours, index) => <td key={quarter.monthKeys[index]} className="px-1 pt-2.5 text-center tabular-nums">{formatNumber(hours)}</td>)}
            <td className="px-5 pt-2.5 text-right tabular-nums">{formatHours(monthTotals.reduce((sum, hours) => sum + hours, 0))}</td>
          </tr>
        </tfoot>
      </table>
      {people.length > 8 ? <button type="button" onClick={() => setShowAll((value) => !value)} className="ml-5 mt-3 text-xs font-medium text-primary hover:underline">{showAll ? 'Свернуть' : `Показать всех (${people.length})`}</button> : null}
    </div> : <EmptyState text={`На ${quarter.label} никто не назначен.`} />}
  </SectionCard>;
}

function RolesCard({ roles, quarter }: { roles: RoleRow[]; quarter: QuarterRef }) {
  const total = roles.reduce((sum, role) => sum + role.quarterHours, 0);
  const max = Math.max(1, ...roles.map((role) => role.quarterHours));
  return <SectionCard title="Роли" description={`Часы ${quarter.label} по ролям · ${formatHours(total)}`}>
    {roles.length ? <ul className="space-y-3.5">
      {roles.map((role) => <li key={role.id}>
        <div className="flex items-baseline justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2 text-sm font-medium text-foreground"><ColorMark color={role.color} /><span className="truncate">{role.name}</span></span>
          <span className="shrink-0 text-sm tabular-nums"><span className="font-semibold text-foreground">{formatHours(role.quarterHours)}</span><span className="ml-1.5 text-xs text-muted-foreground">{percent(role.quarterHours, total)}%</span></span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted/60"><div className="h-full rounded-r-[4px]" style={{ width: `${(role.quarterHours / max) * 100}%`, backgroundColor: role.color }} /></div>
        <p className="mt-1 text-[11px] text-muted-foreground">{role.people} {plural(role.people, 'человек', 'человека', 'человек')} · {role.features} {plural(role.features, 'фича', 'фичи', 'фич')}{Math.abs(role.estimate - role.quarterHours) >= 0.5 ? ` · оценка ${formatHours(role.estimate)}` : ''}</p>
      </li>)}
    </ul> : <EmptyState text="В проекте пока нет ролей." />}
  </SectionCard>;
}

function StatusCard({ statuses, total }: { statuses: RoadmapAnalytics['statuses']; total: number }) {
  const present = statuses.filter((status) => status.count);
  return <SectionCard title="Статусы фич" description={`${total} ${plural(total, 'фича', 'фичи', 'фич')} в проекте`}>
    {total ? <>
      <div className="flex h-3 gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={present.map((status) => `${statusGroupLabels[status.group]}: ${status.count}`).join(', ')}>
        {present.map((status) => <div key={status.group} title={`${statusGroupLabels[status.group]}: ${status.count}`} style={{ flexGrow: status.count, backgroundColor: statusStyles[status.group].color }} />)}
      </div>
      <ul className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        {statuses.map((status) => {
          const Icon = statusStyles[status.group].icon;
          return <li key={status.group} className={cn('min-w-0', !status.count && 'opacity-50')}>
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><Icon className="h-3.5 w-3.5 shrink-0" style={{ color: statusStyles[status.group].color }} strokeWidth={2} />{statusGroupLabels[status.group]}</p>
            <p className="mt-0.5 text-lg font-semibold text-foreground">{status.count}<span className="ml-1.5 text-xs font-normal text-muted-foreground">{percent(status.count, total)}%</span></p>
            {status.states.length ? <p className="truncate text-[11px] text-muted-foreground" title={status.states.map((state) => `${state.name}: ${state.count}`).join(', ')}>{status.states.map((state) => `${state.name} ${state.count}`).join(' · ')}</p> : null}
          </li>;
        })}
      </ul>
    </> : <EmptyState text="В проекте пока нет фич." />}
  </SectionCard>;
}

function StatusPill({ group, state }: { group: StatusGroup; state: string | null }) {
  const Icon = statusStyles[group].icon;
  return <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-md bg-muted/70 px-1.5 py-0.5 text-[11px] text-foreground/80"><Icon className="h-3 w-3" style={{ color: statusStyles[group].color }} strokeWidth={2.2} />{state?.trim() || statusGroupLabels[group]}</span>;
}

function EpicsCard({ rows, roles, roleOrder, quarter }: { rows: EpicRow[]; roles: RoleLookup; roleOrder: string[]; quarter: QuarterRef }) {
  return <SectionCard title="Эпики" description="Готовность, план на квартал и фактические часы по каждому эпику">
    {rows.length ? <div className="-mx-5 overflow-x-auto">
      <table className="w-full min-w-[860px] text-sm">
        <thead>
          <tr className="text-left text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            <th scope="col" className="px-5 pb-2 font-medium">Эпик</th>
            <th scope="col" className="w-48 px-3 pb-2 font-medium">Готовность фич</th>
            <th scope="col" className="w-28 px-3 pb-2 text-right font-medium">План {quarter.label}</th>
            <th scope="col" className="w-28 px-3 pb-2 text-right font-medium">Оценка всего</th>
            <th scope="col" className="w-32 px-3 pb-2 text-right font-medium">Факт</th>
            <th scope="col" className="w-44 px-5 pb-2 font-medium">Роли в квартале</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const ordered = roleOrder.map((id) => row.byRole.find((share) => share.roleId === id)).filter((share): share is RoleShare => Boolean(share));
            const overrun = row.estimate > 0 && row.actual > row.estimate;
            return <tr key={row.id} className="border-t border-border/60 align-middle">
              <td className="px-5 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <p className={cn('truncate font-medium', row.id === 'no-epic' ? 'text-muted-foreground' : 'text-foreground')} title={row.title}>{row.title}</p>
                  {row.url ? <a href={row.url} target="_blank" rel="noreferrer" aria-label={`Открыть «${row.title}» в Azure DevOps`} className="shrink-0 text-muted-foreground hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /></a> : null}
                </div>
                {row.id !== 'no-epic' ? <div className="mt-1"><StatusPill group={row.group} state={row.state} /></div> : null}
              </td>
              <td className="px-3 py-3">
                {row.features ? <>
                  <div className="flex items-baseline justify-between text-xs"><span className="text-muted-foreground">{row.done} из {row.features}</span><span className="font-semibold tabular-nums text-foreground">{percent(row.done, row.features)}%</span></div>
                  <div className="mt-1.5"><Meter value={row.done / row.features} color={statusStyles.done.color} label={`Готовность эпика «${row.title}»`} /></div>
                </> : <span className="text-xs text-muted-foreground">Нет фич</span>}
              </td>
              <td className="px-3 py-3 text-right tabular-nums">{row.quarterHours ? <span className="font-semibold text-foreground">{formatHours(row.quarterHours)}</span> : <span className="text-muted-foreground">—</span>}</td>
              <td className="px-3 py-3 text-right tabular-nums text-foreground/80">{row.estimate ? formatHours(row.estimate) : <span className="text-muted-foreground">—</span>}</td>
              <td className="px-3 py-3 text-right tabular-nums">
                {row.actual ? <>
                  <p className="text-foreground">{formatHours(row.actual)}</p>
                  {row.estimate ? <p className={cn('mt-0.5 inline-flex items-center gap-1 text-[11px]', overrun ? 'font-medium text-destructive' : 'text-muted-foreground')}>{overrun ? <TrendingUp className="h-3 w-3" /> : null}{formatPercent(row.actual, row.estimate)} от оценки</p> : null}
                </> : <span className="text-muted-foreground">—</span>}
              </td>
              <td className="px-5 py-3">
                {ordered.length ? <div className="flex h-2 gap-[2px] overflow-hidden rounded-[4px]" role="img" aria-label={ordered.map((share) => `${roles.get(share.roleId)?.name ?? 'Роль'}: ${formatHours(share.hours)}`).join(', ')}>
                  {ordered.map((share) => <div key={share.roleId} title={`${roles.get(share.roleId)?.name ?? 'Роль'}: ${formatHours(share.hours)}`} style={{ flexGrow: share.hours, backgroundColor: roles.get(share.roleId)?.color ?? '#94a3b8' }} />)}
                </div> : <span className="text-xs text-muted-foreground">Не запланировано</span>}
              </td>
            </tr>;
          })}
        </tbody>
      </table>
    </div> : <EmptyState text="В проекте пока нет эпиков и фич." />}
  </SectionCard>;
}

function EmptyState({ text }: { text: string }) {
  return <p className="py-10 text-center text-sm text-muted-foreground">{text}</p>;
}

function plural(count: number, one: string, few: string, many: string) {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function RoadmapAnalyticsPage() {
  const projectsQuery = useQuery({ queryKey: ['roadmap', 'azure-projects'], queryFn: roadmapApi.projects });
  const projects = useMemo(() => projectsQuery.data?.data ?? [], [projectsQuery.data?.data]);
  const [projectId, setProjectId] = useState('');
  const [quarter, setQuarter] = useState(currentQuarterRef);
  const project = projects.find((item) => item.id === projectId);
  const roadmapProjectId = project?.roadmapId ?? '';
  const planQuery = useQuery({
    queryKey: ['roadmap', 'plan', roadmapProjectId],
    queryFn: () => roadmapApi.plan(roadmapProjectId),
    enabled: Boolean(roadmapProjectId),
  });
  const plan = planQuery.data;
  const analytics = useMemo(() => (plan ? buildAnalytics(plan, quarter) : null), [plan, quarter]);
  const roleLookup: RoleLookup = useMemo(() => {
    const lookup: RoleLookup = new Map((plan?.roles ?? []).map((role) => [role.id, role]));
    plan?.workItems.forEach((item) => item.allocations.forEach((allocation) => { if (!lookup.has(allocation.roleId)) lookup.set(allocation.roleId, allocation.role); }));
    return lookup;
  }, [plan]);
  const roleOrder = useMemo(() => [...roleLookup.keys()], [roleLookup]);

  useEffect(() => {
    if (projectId && projects.some((item) => item.id === projectId)) return;
    const firstImported = projects.find((item) => item.imported);
    if (firstImported) setProjectId(firstImported.id);
    else if (projects.length) setProjectId(projects[0].id);
  }, [projectId, projects]);

  const topPerson = analytics?.people[0];
  const error = projectsQuery.error ?? planQuery.error;

  return <main className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6 lg:px-8">
    <div className="mx-auto w-full space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Сводка по проекту</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Аналитика</h1>
          <p className="mt-1 truncate text-sm text-muted-foreground">{plan ? <>{plan.name} · {plan.syncedAt ? `синхронизировано ${new Date(plan.syncedAt).toLocaleString('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })}` : 'ещё не синхронизирован'}</> : 'Загрузка, готовность и риски квартального плана'}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <AzureProjectPicker projects={projects} value={projectId} onChange={setProjectId} disabled={projectsQuery.isLoading} placeholder="Выбрать проект" />
          <QuarterSwitcher quarter={quarter} onShift={(offset) => setQuarter((current) => shiftQuarter(current, offset))} />
        </div>
      </div>

      {error ? <div role="alert" className="rounded-lg border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">{error instanceof Error ? error.message : 'Не удалось загрузить аналитику'}</div> : null}

      {projectsQuery.isLoading || (roadmapProjectId && planQuery.isLoading) ? <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <div key={index} className="h-36 animate-pulse rounded-xl border border-border bg-card" />)}</div>
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]"><div className="h-80 animate-pulse rounded-xl border border-border bg-card" /><div className="h-80 animate-pulse rounded-xl border border-border bg-card" /></div>
      </div> : !projects.length ? <Card className="p-8 text-center"><p className="font-medium text-foreground">Пока нет проектов</p><p className="mt-1 text-sm text-muted-foreground">Импортируйте проект в Roadmap, чтобы увидеть его метрики.</p></Card> : !roadmapProjectId ? <Card className="p-8 text-center"><p className="font-medium text-foreground">Проект ещё не импортирован</p><p className="mt-1 text-sm text-muted-foreground">Выберите импортированный проект для просмотра аналитики.</p></Card> : analytics ? <>
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5" aria-label="Ключевые показатели">
          <StatTile
            label={`Оценка на ${quarter.label}`}
            value={formatHours(analytics.quarter.estimate)}
            meter={analytics.quarter.estimate ? { value: analytics.quarter.distributed / analytics.quarter.estimate } : undefined}
            note={analytics.quarter.estimate ? `Разложено по месяцам ${formatHours(analytics.quarter.distributed)} — ${formatPercent(analytics.quarter.distributed, analytics.quarter.estimate)}` : 'На квартал ещё нет назначений'}
          />
          <StatTile
            label="Покрытие фич"
            value={<>{analytics.counts.covered}<span className="text-lg font-medium text-muted-foreground"> из {analytics.counts.open}</span></>}
            meter={analytics.counts.open ? { value: analytics.counts.covered / analytics.counts.open } : undefined}
            note={analytics.counts.open ? `Открытые фичи с назначениями на квартал — ${percent(analytics.counts.covered, analytics.counts.open)}%` : 'Открытых фич нет'}
          />
          <StatTile
            label="Готовность"
            value={`${percent(analytics.counts.done, analytics.counts.features)}%`}
            meter={analytics.counts.features ? { value: analytics.counts.done / analytics.counts.features, color: statusStyles.done.color } : undefined}
            note={`${analytics.counts.done} из ${analytics.counts.features} фич закрыто · ${analytics.counts.epics} ${plural(analytics.counts.epics, 'эпик', 'эпика', 'эпиков')}`}
          />
          <StatTile
            label="Фактические часы"
            value={formatHours(analytics.hours.actual)}
            meter={analytics.hours.estimate && analytics.hours.actual ? { value: analytics.hours.actual / analytics.hours.estimate, color: analytics.hours.actual > analytics.hours.estimate ? 'hsl(var(--destructive))' : undefined } : undefined}
            note={analytics.hours.actual ? `${formatPercent(analytics.hours.actual, analytics.hours.estimate)} от общей оценки ${formatHours(analytics.hours.estimate)}` : 'В Azure DevOps пока нет списанного времени'}
          />
          <StatTile
            label="Команда квартала"
            value={<>{analytics.people.length}<span className="text-lg font-medium text-muted-foreground"> {plural(analytics.people.length, 'человек', 'человека', 'человек')}</span></>}
            note={!topPerson ? 'Назначьте людей на фичи в плане проекта' : topPerson.total ? `Больше всех часов у ${topPerson.name} — ${formatHours(topPerson.total)}` : `Больше всего оценки у ${topPerson.name} — ${formatHours(topPerson.estimate)}`}
          />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(320px,1fr)]">
          <MonthlyLoadChart months={analytics.months} roles={roleLookup} roleOrder={roleOrder} quarter={quarter} />
          <AttentionCard items={analytics.attention} quarter={quarter} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
          <TeamLoadCard people={analytics.people} roles={roleLookup} quarter={quarter} />
          <div className="flex min-w-0 flex-col gap-4">
            <RolesCard roles={analytics.roles} quarter={quarter} />
            <StatusCard statuses={analytics.statuses} total={analytics.counts.features} />
          </div>
        </section>

        <EpicsCard rows={analytics.epicRows} roles={roleLookup} roleOrder={roleOrder} quarter={quarter} />
      </> : null}
    </div>
  </main>;
}
