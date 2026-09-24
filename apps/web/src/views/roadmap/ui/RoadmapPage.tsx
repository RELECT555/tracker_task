'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertCircle, ArrowDownToLine, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Equal, Maximize2, Minimize2, Pencil, Plus, RefreshCw, Users, X } from 'lucide-react';
import { useAuth } from '@/features/auth/model/useAuth';
import { isAdminUser } from '@/features/auth/lib/is-admin';
import { routes } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import {
  roadmapApi,
  type AzureProject,
  type RoadmapAllocation,
  type RoadmapPeriod,
  type RoadmapRole,
  type RoadmapWorkItem,
} from '@/entities/roadmap/api/roadmapApi';
import { AzureProjectPicker } from '@/entities/roadmap/ui/AzureProjectPicker';

function ErrorMessage({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/5 px-3 py-2 text-sm text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error instanceof Error ? error.message : 'Не удалось выполнить запрос'}</span>
    </div>
  );
}

type QuarterMonth = { monthKey: string; label: string; startsAt: string; endsAt: string };

function quarterMonths(year: number, quarter: number): QuarterMonth[] {
  return Array.from({ length: 3 }, (_, index) => {
    const month = (quarter - 1) * 3 + index;
    const first = new Date(Date.UTC(year, month, 1));
    const last = new Date(Date.UTC(year, month + 1, 0));
    const monthKey = `${year}-${String(month + 1).padStart(2, '0')}`;
    return {
      monthKey,
      label: new Intl.DateTimeFormat('ru-RU', { month: 'long', timeZone: 'UTC' }).format(first),
      startsAt: first.toISOString().slice(0, 10),
      endsAt: last.toISOString().slice(0, 10),
    };
  });
}

function QuarterHoursCell({ hours, label, disabled, allocationId, rowIndex, monthIndex, onSave }: {
  hours: number;
  label: string;
  disabled: boolean;
  allocationId: string;
  rowIndex: number;
  monthIndex: number;
  onSave: (hours: number) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState(hours ? String(hours) : '');
  useEffect(() => setDraft(hours ? String(hours) : ''), [hours]);

  const save = async () => {
    const next = draft.trim() ? Number(draft) : 0;
    if (!Number.isFinite(next) || next < 0 || Math.abs(next * 2 - Math.round(next * 2)) > 1e-8) {
      setDraft(hours ? String(hours) : '');
      return;
    }
    if (next !== hours && !(await onSave(next))) setDraft(hours ? String(hours) : '');
  };

  return <input
    type="number"
    min="0"
    step="0.5"
    value={draft}
    disabled={disabled}
    aria-label={label}
    title={label}
    placeholder="—"
    data-quarter-cell="true"
    data-quarter-allocation={allocationId}
    data-quarter-row={rowIndex}
    data-quarter-month={monthIndex}
    onChange={(event) => setDraft(event.target.value)}
    onBlur={() => void save()}
    onKeyDown={(event) => {
      if (event.key === 'Enter') event.currentTarget.blur();
      if (event.key === 'Escape') { setDraft(hours ? String(hours) : ''); event.currentTarget.blur(); }
      if (event.key === 'Tab') {
        const cells = Array.from(event.currentTarget.closest('table')?.querySelectorAll<HTMLInputElement>('[data-quarter-cell="true"]') ?? []);
        const next = cells[cells.indexOf(event.currentTarget) + (event.shiftKey ? -1 : 1)];
        if (next) { event.preventDefault(); next.focus(); }
      }
    }}
    className="h-9 w-20 rounded-md border border-border/70 bg-background px-2 text-right text-sm font-medium tabular-nums text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 hover:border-primary/40 hover:bg-primary/[0.025] focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
  />;
}

function QuarterAssignmentButton({ item, roles, saving, canConfigure, onSave }: {
  item: RoadmapWorkItem;
  roles: RoadmapRole[];
  saving: boolean;
  canConfigure: boolean;
  onSave: (data: Parameters<typeof roadmapApi.saveAllocation>[0]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [roleId, setRoleId] = useState('');
  const [personId, setPersonId] = useState('');
  const [hours, setHours] = useState('');
  const availableRoles = roles.filter((role) => role.members?.some((member) => member.personIsActive));
  const selectedRole = availableRoles.find((role) => role.id === roleId);
  const members = (selectedRole?.members ?? []).filter((member) => member.personIsActive && !item.allocations.some((allocation) => allocation.roleId === roleId && allocation.personExternalId === member.personExternalId));

  const openEditor = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) return;
    const firstRole = availableRoles[0];
    setRoleId(firstRole?.id ?? '');
    const defaultMember = firstRole?.members?.find((member) => member.personIsActive && member.personExternalId === firstRole.defaultPersonExternalId && !item.allocations.some((allocation) => allocation.roleId === firstRole.id && allocation.personExternalId === member.personExternalId));
    setPersonId(defaultMember?.personExternalId ?? '');
    setHours('');
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const member = members.find((entry) => entry.personExternalId === personId);
    if (!selectedRole || !member) return;
    onSave({
      workItemId: item.id,
      roleId: selectedRole.id,
      personExternalId: member.personExternalId,
      personName: member.personName,
      personEmail: member.personEmail,
      estimatedHours: Number(hours) || 0,
      periods: [],
    });
    setOpen(false);
  };

  return <Popover open={open} onOpenChange={openEditor}>
    <PopoverTrigger asChild><Button type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs"><Plus className="h-3.5 w-3.5" />Назначить</Button></PopoverTrigger>
    <PopoverContent align="start" side="bottom" sideOffset={6} collisionPadding={12} className="w-[min(340px,calc(100vw-2rem))] rounded-xl p-0">
      {availableRoles.length ? <form onSubmit={submit}>
        <div className="border-b border-border px-3 py-2.5"><p className="text-sm font-medium">Назначить участника</p><p className="truncate text-xs text-muted-foreground" title={item.title}>{item.title}</p></div>
        <div className="space-y-3 p-3">
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">Роль</label>
            <SearchableSelect
              value={roleId}
              placeholder="Выберите роль"
              searchPlaceholder="Найти роль…"
              options={availableRoles.map((role) => ({ value: role.id, label: role.name, color: role.color, badge: role.isMock ? 'демо' : undefined }))}
              emptyLabel="Роли не найдены"
              onChange={(nextRoleId) => {
                const nextRole = availableRoles.find((role) => role.id === nextRoleId);
                setRoleId(nextRoleId);
                const nextDefault = nextRole?.members?.find((member) => member.personIsActive && member.personExternalId === nextRole.defaultPersonExternalId && !item.allocations.some((allocation) => allocation.roleId === nextRole.id && allocation.personExternalId === member.personExternalId));
                setPersonId(nextDefault?.personExternalId ?? '');
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-muted-foreground">Участник</label>
            <SearchableSelect
              value={personId}
              placeholder="Выберите участника"
              searchPlaceholder="Найти участника…"
              options={members.map((member) => ({ value: member.personExternalId, label: member.personName, description: member.personEmail, badge: member.personIsMock ? 'демо' : undefined }))}
              emptyLabel="Нет свободных участников"
              onChange={setPersonId}
            />
          </div>
          <label className="block space-y-1 text-xs font-medium text-muted-foreground">Общая оценка, ч
            <input type="number" min="0" step="0.5" value={hours} onChange={(event) => setHours(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground" placeholder="0" />
          </label>
          {!members.length ? <p className="text-xs text-muted-foreground">Все участники этой роли уже назначены.</p> : null}
        </div>
        <div className="flex justify-end border-t border-border bg-muted/20 p-2.5"><Button type="submit" size="sm" disabled={!personId || saving}>{saving ? 'Сохраняем…' : 'Добавить назначение'}</Button></div>
      </form> : <div className="space-y-2 p-3 text-sm"><p className="font-medium">Нет доступных участников</p><p className="text-xs text-muted-foreground">Добавьте участников в роли проекта, чтобы назначить их на работу.</p>{canConfigure ? <Link href={routes.roadmapAdminRoles} className="inline-flex text-xs font-medium text-primary hover:underline">Настроить роли и участников</Link> : <p className="text-xs text-muted-foreground">Попросите администратора добавить участников в роли.</p>}</div>}
    </PopoverContent>
  </Popover>;
}

function QuarterPlanningGrid({
  epics,
  features,
  months,
  roles,
  canConfigure,
  saving,
  focusMode,
  showUnassigned,
  expandedEpics,
  onToggleEpic,
  onSaveQuarter,
  onAddAssignment,
}: {
  epics: RoadmapWorkItem[];
  features: RoadmapWorkItem[];
  months: QuarterMonth[];
  roles: RoadmapRole[];
  canConfigure: boolean;
  saving: boolean;
  focusMode: boolean;
  showUnassigned: boolean;
  expandedEpics: Set<string>;
  onToggleEpic: (epicId: string) => void;
  onSaveQuarter: (allocation: RoadmapAllocation, values: { monthKey: string; hours: number }[]) => Promise<boolean>;
  onAddAssignment: (data: Parameters<typeof roadmapApi.saveAllocation>[0]) => void;
}) {
  const monthHours = (allocations: RoadmapAllocation[], monthKey: string) => allocations.reduce((sum, allocation) =>
    sum + allocation.periods.reduce((inner, period) => inner + (period.monthKey === monthKey ? Number(period.hours) : 0), 0), 0);
  const plannedHours = (allocation: RoadmapAllocation) => allocation.periods.reduce((sum, period) => sum + Number(period.hours), 0);
  const quarterHours = (allocations: RoadmapAllocation[]) => months.reduce((sum, month) => sum + monthHours(allocations, month.monthKey), 0);
  const assignments = [...epics.flatMap((epic) => epic.allocations), ...features.flatMap((feature) => feature.allocations)];
  const legacyPeriods = assignments.flatMap((allocation) => allocation.periods.filter((period) => !period.monthKey));
  const legacyHours = legacyPeriods.reduce((sum, period) => sum + Number(period.hours), 0);

  const renderSummary = (item: RoadmapWorkItem, itemAllocations: RoadmapAllocation[], epic = false) => (
    <tr key={`summary-${item.id}`} className={`group border-b border-border/70 ${epic ? 'bg-muted/35' : 'bg-muted/10'}`}>
      <th scope="row" className={`sticky left-0 z-[2] border-r border-border/80 px-4 py-2.5 text-left text-sm text-foreground ${epic ? 'bg-muted/65 font-semibold' : 'bg-muted/35 font-medium'}`}>
        <div className="flex min-w-0 items-center gap-2">
          {epic ? <button type="button" aria-expanded={expandedEpics.has(item.id)} aria-label={`${expandedEpics.has(item.id) ? 'Свернуть' : 'Развернуть'} эпик ${item.title}`} onClick={() => onToggleEpic(item.id)} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"><ChevronRight className={`h-4 w-4 transition-transform ${expandedEpics.has(item.id) ? 'rotate-90' : ''}`} /></button> : null}
          {!epic ? <span className="ml-7 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/45" /> : null}
          <span className="min-w-0 flex-1 truncate" title={item.title}>{item.title}</span>
          <span className="shrink-0 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-normal text-muted-foreground">{itemAllocations.length} назн.</span>
          <QuarterAssignmentButton item={item} roles={roles} saving={saving} canConfigure={canConfigure} onSave={onAddAssignment} />
        </div>
      </th>
      {months.map((month) => <td key={month.monthKey} className="border-b border-border/50 px-3 py-2.5 text-right text-sm tabular-nums text-muted-foreground">{monthHours(itemAllocations, month.monthKey) || '—'}</td>)}
      <td className="border-b border-l border-primary/10 bg-primary/[0.025] px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">{quarterHours(itemAllocations) || '—'}</td>
      <td className="border-b border-border/50 px-4 py-2.5 text-right text-sm tabular-nums text-muted-foreground">{itemAllocations.reduce((sum, allocation) => sum + Number(allocation.estimatedHours) - plannedHours(allocation), 0) || '—'}</td>
    </tr>
  );

  const renderAssignment = (item: RoadmapWorkItem, allocation: RoadmapAllocation, directEpic = false) => {
    const rowIndex = nextAssignmentRow++;
    const allPlanned = plannedHours(allocation);
    const remaining = Number(allocation.estimatedHours) - allPlanned;
    const monthsPlanned = quarterHours([allocation]);
    const distributeEvenly = () => {
      const perMonth = Math.round((monthsPlanned / 3) * 2) / 2;
      const values = months.map((month, index) => ({
        monthKey: month.monthKey,
        hours: index < 2 ? perMonth : Math.round((monthsPlanned - perMonth * 2) * 2) / 2,
      }));
      void onSaveQuarter(allocation, values);
    };

    return <tr key={`allocation-${allocation.id}`} className="group border-b border-border/50 transition-colors hover:bg-primary/[0.025]">
      <th scope="row" className="sticky left-0 z-[2] min-w-72 border-r border-border/80 bg-background px-4 py-2 text-left font-normal group-hover:bg-muted/20">
        <div className="flex min-w-0 items-center gap-2 pl-10">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: allocation.role.color }} />
          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground" title={`${allocation.role.name} · ${allocation.personName}`}>{directEpic ? 'На эпике · ' : ''}<span className="font-medium">{allocation.role.name}</span><span className="text-muted-foreground"> · {allocation.personName}</span></span>
          {monthsPlanned > 0 ? <button type="button" disabled={saving} onClick={distributeEvenly} className="shrink-0 rounded px-1.5 py-1 text-[10px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50">Ровно</button> : null}
        </div>
        {allocation.periods.some((period) => !period.monthKey) ? <p className="pl-10 pt-1 text-[10px] text-amber-700 dark:text-amber-300" title={allocation.periods.filter((period) => !period.monthKey).map((period) => `${period.label}: ${period.startsAt.slice(0, 10)}–${period.endsAt.slice(0, 10)}, ${Number(period.hours)} ч`).join('\n')}>Старые периоды: {allocation.periods.filter((period) => !period.monthKey).reduce((sum, period) => sum + Number(period.hours), 0)} ч</p> : null}
      </th>
      {months.map((month, monthIndex) => <td key={month.monthKey} className="border-b border-border/50 px-3 py-1.5 text-right">
        <QuarterHoursCell
          hours={Number(allocation.periods.find((period) => period.monthKey === month.monthKey)?.hours ?? 0)}
          label={`${item.title} · ${allocation.role.name} · ${allocation.personName} · ${month.label}`}
          disabled={saving}
          allocationId={allocation.id}
          rowIndex={rowIndex}
          monthIndex={monthIndex}
          onSave={async (hours) => {
            const values = months.map((entry) => ({
              monthKey: entry.monthKey,
              hours: entry.monthKey === month.monthKey
                ? hours
                : Number(allocation.periods.find((period) => period.monthKey === entry.monthKey)?.hours ?? 0),
            }));
            return onSaveQuarter(allocation, values);
          }}
        />
      </td>)}
      <td className="whitespace-nowrap border-b border-l border-primary/10 bg-primary/[0.025] px-3 py-2 text-right text-sm font-semibold tabular-nums text-foreground">{monthsPlanned || '—'} ч</td>
      <td className={`whitespace-nowrap border-b border-border/50 px-4 py-2 text-right text-xs tabular-nums ${remaining < 0 ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>{remaining < 0 ? `Перепланировано ${Math.abs(remaining)} ч` : `${remaining} ч`}</td>
    </tr>;
  };

  const renderFeature = (feature: RoadmapWorkItem) => <Fragment key={`feature-${feature.id}`}>
    {renderSummary(feature, feature.allocations)}
    {feature.allocations.map((allocation) => renderAssignment(feature, allocation))}
  </Fragment>;

  const totalAllocations = assignments;
  const totalEstimate = totalAllocations.reduce((sum, allocation) => sum + Number(allocation.estimatedHours), 0);
  const totalPlanned = totalAllocations.reduce((sum, allocation) => sum + plannedHours(allocation), 0);
  const totalQuarter = quarterHours(totalAllocations);
  let nextAssignmentRow = 0;

  const handlePaste = (event: React.ClipboardEvent<HTMLTableElement>) => {
    const target = event.target as HTMLInputElement;
    if (target.dataset.quarterCell !== 'true') return;
    const text = event.clipboardData.getData('text/plain');
    if (!text.includes('\t') && !text.includes('\n')) return;
    event.preventDefault();
    const matrix = text.replace(/\r/g, '').split('\n');
    if (matrix[matrix.length - 1] === '') matrix.pop();
    const startRow = Number(target.dataset.quarterRow);
    const startMonth = Number(target.dataset.quarterMonth);
    const table = target.closest('table');
    const cells = Array.from(table?.querySelectorAll<HTMLInputElement>('[data-quarter-cell="true"]') ?? []);
    const rows = new Map<number, string>();
    cells.forEach((cell) => rows.set(Number(cell.dataset.quarterRow), cell.dataset.quarterAllocation ?? ''));
    const allocationById = new Map(assignments.map((allocation) => [allocation.id, allocation]));
    const updates = new Map<string, Map<number, number>>();
    for (const [rowOffset, line] of matrix.entries()) {
      const allocationId = rows.get(startRow + rowOffset);
      if (!allocationId || !allocationById.has(allocationId)) return;
      for (const [columnOffset, raw] of line.split('\t').entries()) {
        const monthIndex = startMonth + columnOffset;
        const value = raw.trim() === '' ? 0 : Number(raw.trim().replace(',', '.'));
        if (monthIndex >= months.length || !Number.isFinite(value) || value < 0 || Math.abs(value * 2 - Math.round(value * 2)) > 1e-8) return;
        const values = updates.get(allocationId) ?? new Map<number, number>();
        values.set(monthIndex, value);
        updates.set(allocationId, values);
      }
    }
    void (async () => {
      for (const [allocationId, changed] of updates) {
        const allocation = allocationById.get(allocationId);
        if (!allocation) continue;
        const values = months.map((month, monthIndex) => ({
          monthKey: month.monthKey,
          hours: changed.get(monthIndex) ?? Number(allocation.periods.find((period) => period.monthKey === month.monthKey)?.hours ?? 0),
        }));
        if (!(await onSaveQuarter(allocation, values))) break;
      }
    })();
  };

  return <div className={focusMode ? 'flex min-h-0 flex-1 flex-col gap-3' : 'space-y-3'}>
    {legacyPeriods.length ? <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-800 dark:text-amber-200">Сохранены старые периоды без месячной детализации: {legacyHours} ч. Они не распределены по месяцам, но учитываются в проверке общей оценки.</div> : null}
    {saving ? <p role="status" className="text-xs text-muted-foreground">Сохраняем план…</p> : null}
    <div className={focusMode ? 'min-h-0 flex-1 overflow-auto' : 'overflow-auto'}>
      <table onPaste={handlePaste} className="w-full min-w-[1040px] table-fixed border-collapse text-left">
        <colgroup>
          <col style={{ width: '42%' }} />
          <col style={{ width: '10.5%' }} />
          <col style={{ width: '10.5%' }} />
          <col style={{ width: '10.5%' }} />
          <col style={{ width: '12%' }} />
          <col style={{ width: '14.5%' }} />
        </colgroup>
        <thead className="sticky top-0 z-[3] bg-muted/90 backdrop-blur">
          <tr className="border-b border-border text-xs font-semibold text-muted-foreground">
            <th scope="col" className="sticky left-0 top-0 z-20 min-w-72 border-r border-border/80 bg-muted/90 px-4 py-3">Задача / назначение</th>
            {months.map((month) => <th key={month.monthKey} scope="col" className="min-w-28 px-3 py-3 text-right"><span className="block capitalize text-foreground">{month.label}</span><span className="text-[10px] font-normal">план, ч</span></th>)}
            <th scope="col" className="min-w-24 border-l border-primary/10 bg-primary/[0.025] px-3 py-3 text-right"><span className="block text-foreground">Квартал</span><span className="text-[10px] font-normal">итого, ч</span></th>
            <th scope="col" className="min-w-36 px-4 py-3 text-right"><span className="block text-foreground">Не распределено</span><span className="text-[10px] font-normal">от оценки, ч</span></th>
          </tr>
        </thead>
        <tbody>
          {epics.map((epic) => {
            const children = features.filter((feature) => feature.parentExternalId === epic.externalId);
            const visibleChildren = showUnassigned ? children : children.filter((feature) => feature.allocations.length > 0);
            const epicAllocations = [...epic.allocations, ...visibleChildren.flatMap((feature) => feature.allocations)];
            if (!showUnassigned && epicAllocations.length === 0) return null;
            return <Fragment key={`epic-${epic.id}`}>
              {renderSummary(epic, epicAllocations, true)}
              {expandedEpics.has(epic.id) ? <>
                {epic.allocations.map((allocation) => renderAssignment(epic, allocation, true))}
                {visibleChildren.map(renderFeature)}
              </> : null}
            </Fragment>;
          })}
          {features.filter((feature) => (!feature.parentExternalId || !epics.some((epic) => epic.externalId === feature.parentExternalId)) && (showUnassigned || feature.allocations.length > 0)).map(renderFeature)}
        </tbody>
        <tfoot className="sticky bottom-0 z-[3] border-t-2 border-border bg-muted/90 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] backdrop-blur">
          <tr className="text-sm font-semibold text-foreground">
            <th scope="row" className="sticky left-0 z-20 border-r border-border/80 bg-muted/90 px-4 py-3">Итого по проекту</th>
            {months.map((month) => <td key={month.monthKey} className="px-3 py-3 text-right tabular-nums">{monthHours(totalAllocations, month.monthKey)} ч</td>)}
            <td className="border-l border-primary/10 bg-primary/[0.04] px-3 py-3 text-right tabular-nums">{totalQuarter} ч</td>
            <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">{totalEstimate - totalPlanned} ч</td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>;
}

function AllocationEditor({
  item,
  role,
  people,
  initial,
  defaultPersonExternalId,
  onSave,
  saving,
}: {
  item: RoadmapWorkItem;
  role: RoadmapRole;
  people: { id: string; name: string; email: string | null; isMock?: boolean }[];
  initial?: {
    id: string;
    personExternalId: string;
    estimatedHours: number | string;
    periods: RoadmapPeriod[];
  };
  defaultPersonExternalId?: string | null;
  onSave: (data: {
    allocationId?: string;
    workItemId: string;
    roleId: string;
    personExternalId: string;
    personName: string;
    personEmail?: string | null;
    estimatedHours: number;
    periods: Omit<RoadmapPeriod, 'id'>[];
  }) => void;
  saving: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [personId, setPersonId] = useState('');
  const [hours, setHours] = useState('');
  const selectedPerson = people.find((person) => person.id === personId);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedPerson) return;
    onSave({
      allocationId: initial?.id,
      workItemId: item.id,
      roleId: role.id,
      personExternalId: selectedPerson.id,
      personName: selectedPerson.name,
      personEmail: selectedPerson.email,
      estimatedHours: Number(hours) || 0,
      periods: (initial?.periods ?? []).map((period) => ({
        monthKey: period.monthKey,
        label: period.label,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        hours: Number(period.hours) || 0,
      })),
    });
    setOpen(false);
    setHours('');
  };

  const startEditing = () => {
    setPersonId(initial?.personExternalId ?? defaultPersonExternalId ?? '');
    setHours(initial ? String(initial.estimatedHours) : '');
  };

  return (
    <Popover open={open} onOpenChange={(nextOpen) => { if (nextOpen) startEditing(); setOpen(nextOpen); }}>
      <PopoverTrigger asChild>
        <Button type="button" variant={initial ? 'ghost' : 'outline'} size="sm" className={initial ? 'mt-1 h-7 gap-1 px-2 text-xs text-muted-foreground' : 'mt-2 h-8 gap-1.5 px-2.5 text-xs'} aria-label={initial ? `Изменить оценку: ${selectedPerson?.name ?? initial.personExternalId}` : 'Назначить участника'}>
          {initial ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {initial ? 'Изменить назначение' : defaultPersonExternalId ? 'Задать оценку' : 'Добавить участника'}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" sideOffset={8} collisionPadding={16} className="max-h-[min(80vh,680px)] w-[min(390px,calc(100vw-2rem))] overflow-y-auto rounded-xl p-0">
        <form onSubmit={submit}>
          <div className="flex items-start justify-between border-b border-border px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold">{initial ? 'Оценка участника' : 'Назначение участника'}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{role.name} · {item.title}</p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="-mr-2 -mt-1 h-8 w-8" aria-label="Закрыть" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-4 p-4">
            {initial ? (
              <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">{selectedPerson?.name.slice(0, 1) ?? 'У'}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{selectedPerson?.name ?? initial.personExternalId}</p>
                  <p className="truncate text-xs text-muted-foreground">{selectedPerson?.email ?? 'Участник Azure DevOps'}</p>
                </div>
                {selectedPerson?.isMock ? <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-medium text-amber-700 dark:text-amber-300">ДЕМО</span> : null}
              </div>
            ) : null}
            <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
              {initial ? 'Изменить участника' : 'Участник'}
              <SearchableSelect
                ariaLabel="Человек из Azure DevOps"
                value={personId}
                onChange={setPersonId}
                placeholder="Выберите участника"
                searchPlaceholder="Найти участника…"
                emptyLabel="Участник не найден"
                options={people.map((person) => ({ value: person.id, label: person.name, description: person.email, badge: person.isMock ? 'демо' : undefined }))}
              />
            </label>
            <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
              Общая оценка
              <div className="relative">
                <input type="number" min="0" step="0.5" value={hours} onChange={(event) => setHours(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 pr-12 text-sm text-foreground" placeholder="0" />
                <span className="absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">часов</span>
              </div>
            </label>
          </div>
          <div className="flex justify-end gap-2 border-t border-border bg-muted/20 px-4 py-3">
            <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>Отмена</Button>
            <Button type="submit" size="sm" disabled={!personId || saving}><Check className="mr-1.5 h-4 w-4" />{saving ? 'Сохранение…' : 'Сохранить'}</Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

export function RoadmapPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canConfigure = isAdminUser(user);
  const [selectedAzureProjectId, setSelectedAzureProjectId] = useState('');
  const [roadmapProjectId, setRoadmapProjectId] = useState('');
  const [view, setView] = useState<'roles' | 'periods'>('roles');
  const [focusMode, setFocusMode] = useState(false);
  const [showUnassignedPeriods, setShowUnassignedPeriods] = useState(false);
  const [quarterSelection, setQuarterSelection] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
  });
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(() => new Set());
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [defaultRolePickerId, setDefaultRolePickerId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusMode) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocusMode(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [focusMode]);

  const connectionQuery = useQuery({ queryKey: ['roadmap', 'connection'], queryFn: roadmapApi.connection });
  const configured = connectionQuery.data?.configured ?? false;
  const projectsQuery = useQuery({ queryKey: ['roadmap', 'azure-projects'], queryFn: roadmapApi.projects });
  const peopleQuery = useQuery({ queryKey: ['roadmap', 'people'], queryFn: roadmapApi.people });
  const roleCatalogQuery = useQuery({ queryKey: ['roadmap', 'admin', 'role-catalog'], queryFn: roadmapApi.roleCatalog, enabled: canConfigure });
  const projects = projectsQuery.data?.data ?? [];
  const people = peopleQuery.data?.data ?? [];
  const usingCachedProjects = projectsQuery.data?.source === 'cache';
  const selectedProject = projects.find((project) => project.id === selectedAzureProjectId);

  useEffect(() => {
    if (selectedAzureProjectId || !projects.length) return;
    const first = projects.find((project) => project.imported) ?? projects[0];
    setSelectedAzureProjectId(first.id);
    if (first.roadmapId) setRoadmapProjectId(first.roadmapId);
  }, [projects, selectedAzureProjectId]);

  useEffect(() => {
    if (selectedProject?.roadmapId) setRoadmapProjectId(selectedProject.roadmapId);
    else if (selectedProject && !selectedProject.imported) setRoadmapProjectId('');
  }, [selectedProject]);

  const planQuery = useQuery({
    queryKey: ['roadmap', 'plan', roadmapProjectId],
    queryFn: () => roadmapApi.plan(roadmapProjectId),
    enabled: Boolean(roadmapProjectId),
  });
  const plan = planQuery.data;
  const roles = plan?.roles ?? [];

  const syncMutation = useMutation({
    mutationFn: (project: AzureProject) => roadmapApi.syncProject(project),
    onSuccess: async (result) => {
      setRoadmapProjectId(result.projectId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'azure-projects'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', result.projectId] }),
      ]);
    },
  });
  const saveMutation = useMutation({
    mutationFn: roadmapApi.saveAllocation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', roadmapProjectId] }),
  });
  const saveQuarterMutation = useMutation({
    mutationFn: ({ allocationId, quarterKey, months }: { allocationId: string; quarterKey: string; months: { monthKey: string; hours: number }[] }) => roadmapApi.saveAllocationQuarter(allocationId, quarterKey, months),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', roadmapProjectId] }),
  });
  const addRoleMutation = useMutation({
    mutationFn: (templateId: string) => roadmapApi.addRoleFromCatalog(roadmapProjectId, templateId),
    onSuccess: async () => {
      setRolePickerOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', roadmapProjectId] });
    },
  });
  const setRoleDefaultMutation = useMutation({
    mutationFn: ({ roleId, personExternalId }: { roleId: string; personExternalId: string | null }) => roadmapApi.setRoleDefaultPerson(roleId, personExternalId),
    onSuccess: async () => {
      setDefaultRolePickerId(null);
      await queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', roadmapProjectId] });
    },
  });
  const splitMutation = useMutation({
    mutationFn: (allocations: Parameters<typeof roadmapApi.saveAllocation>[0][]) =>
      Promise.all(allocations.map((allocation) => roadmapApi.saveAllocation(allocation))),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', roadmapProjectId] }),
  });
  const epics = useMemo(() => plan?.workItems.filter((item) => item.type.toLowerCase() === 'epic') ?? [], [plan]);
  const features = useMemo(() => plan?.workItems.filter((item) => item.type.toLowerCase() === 'feature') ?? [], [plan]);
  const plannedItems = plan?.workItems ?? [];
  const assignedPeopleCount = new Set([
    ...(plan?.workItems.flatMap((item) => item.allocations.map((allocation) => allocation.personExternalId)) ?? []),
    ...(plan?.roles.flatMap((role) => role.defaultPersonExternalId ? [role.defaultPersonExternalId] : []) ?? []),
  ]).size;
  const totalHours = plan?.workItems.reduce((sum, item) => sum + item.allocations.reduce((inner, allocation) => inner + Number(allocation.estimatedHours), 0), 0) ?? 0;
  const currentQuarterKey = `${quarterSelection.year}-Q${quarterSelection.quarter}`;
  const currentQuarterMonths = quarterMonths(quarterSelection.year, quarterSelection.quarter);
  const allEpicsExpanded = epics.length > 0 && epics.every((epic) => expandedEpics.has(epic.id));
  const quarterTotalHours = plannedItems
    .filter((item) => item.type.toLowerCase() === 'feature' || item.type.toLowerCase() === 'epic')
    .flatMap((item) => item.allocations)
    .reduce((sum, allocation) => sum + allocation.periods.reduce((inner, period) => inner + (currentQuarterMonths.some((month) => month.monthKey === period.monthKey) ? Number(period.hours) : 0), 0), 0);

  const shiftQuarter = (offset: number) => setQuarterSelection((current) => {
    const date = new Date(current.year, (current.quarter - 1) * 3 + offset * 3, 1);
    return { year: date.getFullYear(), quarter: Math.floor(date.getMonth() / 3) + 1 };
  });
  const saveQuarter = async (allocation: RoadmapAllocation, months: { monthKey: string; hours: number }[]) => {
    try {
      await saveQuarterMutation.mutateAsync({ allocationId: allocation.id, quarterKey: currentQuarterKey, months });
      return true;
    } catch {
      return false;
    }
  };

  function splitEvenly(workItemId: string, allocations: RoadmapWorkItem['allocations']) {
    if (allocations.length < 2) return;
    const share = (total: number, index: number) => {
      const roundedShare = Math.round((total / allocations.length) * 100) / 100;
      return index === allocations.length - 1
        ? Math.round((total - roundedShare * (allocations.length - 1)) * 100) / 100
        : roundedShare;
    };
    const totalEstimatedHours = allocations.reduce((sum, allocation) => sum + Number(allocation.estimatedHours), 0);
    const periodTotals = new Map<string, { monthKey?: string; label: string; startsAt: string; endsAt: string; hours: number }>();
    allocations.flatMap((allocation) => allocation.periods).forEach((period) => {
      const key = period.monthKey ?? `${period.label}|${period.startsAt.slice(0, 10)}|${period.endsAt.slice(0, 10)}`;
      const existing = periodTotals.get(key);
      periodTotals.set(key, existing
        ? { ...existing, hours: existing.hours + Number(period.hours) }
        : { monthKey: period.monthKey ?? undefined, label: period.label, startsAt: period.startsAt, endsAt: period.endsAt, hours: Number(period.hours) });
    });
    splitMutation.mutate(allocations.map((allocation, index) => ({
      workItemId,
      roleId: allocation.roleId,
      personExternalId: allocation.personExternalId,
      personName: allocation.personName,
      personEmail: allocation.personEmail,
      estimatedHours: share(totalEstimatedHours, index),
      periods: [...periodTotals.values()].map((period) => ({
        monthKey: period.monthKey,
        label: period.label,
        startsAt: period.startsAt,
        endsAt: period.endsAt,
        hours: share(period.hours, index),
      })),
    })));
  }

  function renderItemRow(item: RoadmapWorkItem, isEpic = false, childCount = 0, collapsed = false, onToggle?: () => void) {
    const epicChildren = isEpic ? features.filter((feature) => feature.parentExternalId === item.externalId) : [];
    const itemAllocations = isEpic ? [...item.allocations, ...epicChildren.flatMap((feature) => feature.allocations)] : item.allocations;
    const itemHours = itemAllocations.reduce((sum, allocation) => sum + Number(allocation.estimatedHours), 0);
    const periods = itemAllocations.flatMap((allocation) => allocation.periods);
    return (
      <tr key={item.id} className={`border-t border-border/70 align-top hover:bg-muted/20 ${isEpic ? 'bg-muted/20' : ''}`}>
        <td className="min-w-64 px-4 py-3">
          <div className={isEpic ? 'font-medium text-foreground' : 'pl-4'}>
            <div className="flex items-center gap-2">
              {isEpic ? <button type="button" aria-expanded={!collapsed} aria-label={`${collapsed ? 'Развернуть' : 'Свернуть'} эпик ${item.title}`} disabled={!childCount} onClick={onToggle} className="-ml-1 inline-flex min-h-7 min-w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-50">{collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}</button> : <span className="h-1.5 w-1.5 rounded-full bg-primary/60" />}
              <span className="text-sm leading-snug">{item.title}</span>
              {isEpic ? <span className="rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{childCount} фич</span> : null}
            </div>
            <p className="mt-1 pl-6 text-[11px] text-muted-foreground">{item.type} · #{item.externalId}{item.state ? ` · ${item.state}` : ''}</p>
          </div>
        </td>
        {roles.map((role) => {
          const allocations = item.allocations.filter((allocation) => allocation.roleId === role.id);
          const rolePeople = people.filter((person) => role.members?.some((member) => member.personExternalId === person.id && member.personIsActive));
          const featureAllocations = isEpic ? epicChildren.flatMap((feature) => feature.allocations.filter((allocation) => allocation.roleId === role.id)) : [];
          const renderAssignment = (allocation: typeof allocations[number]) => (
            <div key={allocation.id}>
              <div className="rounded-md border border-border/70 bg-background px-2.5 py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{allocation.personName.slice(0, 1)}</span>
                    <div className="min-w-0">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <p className="truncate text-xs font-medium text-foreground">{allocation.personName}</p>
                        {people.find((person) => person.id === allocation.personExternalId)?.isMock ? <span className="shrink-0 rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">демо</span> : null}
                      </div>
                      <p className="truncate text-[10px] text-muted-foreground">{allocation.personEmail}</p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-foreground">{view === 'roles' ? `${Number(allocation.estimatedHours)} ч` : `${allocation.periods.reduce((sum, period) => sum + Number(period.hours), 0)} ч`}</span>
                </div>
                {view === 'periods' && allocation.periods.length ? <div className="mt-2 space-y-1 border-t border-border/60 pt-1.5">{allocation.periods.map((period) => <div key={period.id ?? period.startsAt} className="flex justify-between gap-2 text-[10px] text-muted-foreground"><span>{period.label}</span><span className="tabular-nums">{Number(period.hours)} ч</span></div>)}</div> : null}
              </div>
              {rolePeople.length ? <AllocationEditor item={item} role={role} people={rolePeople} initial={allocation} defaultPersonExternalId={role.defaultPersonExternalId} saving={saveMutation.isPending} onSave={(data) => saveMutation.mutate(data)} /> : null}
            </div>
          );
          const renderDefaultPerson = () => role.defaultPersonExternalId && role.defaultPersonName ? <div className="rounded-md border border-dashed border-primary/30 bg-primary/[0.035] px-2.5 py-2"><div className="flex items-center justify-between gap-2"><div className="flex min-w-0 items-center gap-2"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-semibold text-primary">{role.defaultPersonName.slice(0, 1)}</span><div className="min-w-0"><p className="truncate text-xs font-medium text-foreground">{role.defaultPersonName}</p><p className="truncate text-[10px] text-muted-foreground">{role.defaultPersonEmail}</p></div></div><span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-primary">по умолчанию</span></div></div> : null;
          return (
            <td key={role.id} className="min-w-52 px-3 py-3">
              {isEpic ? (
                <div className="space-y-2">
                  {featureAllocations.length ? <div className="rounded-md bg-muted/40 px-2.5 py-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">{featureAllocations.length} назнач. в фичах</span><span className="ml-2 tabular-nums">{featureAllocations.reduce((sum, allocation) => sum + Number(view === 'roles' ? allocation.estimatedHours : allocation.periods.reduce((periodSum, period) => periodSum + Number(period.hours), 0)), 0)} ч</span></div> : <span className="text-xs text-muted-foreground">Нет назначений в фичах</span>}
                  <div className="space-y-1.5 border-l-2 border-primary/20 pl-2">
                    <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">На эпике отдельно</p>
                    {!allocations.length ? renderDefaultPerson() : null}
                    {allocations.map(renderAssignment)}
                    {rolePeople.length ? <AllocationEditor item={item} role={role} people={rolePeople} defaultPersonExternalId={role.defaultPersonExternalId} saving={saveMutation.isPending} onSave={(data) => saveMutation.mutate(data)} /> : <span className="text-[10px] text-muted-foreground">Добавьте участника в роль в администрировании.</span>}
                  </div>
                </div>
              ) : <div className="space-y-2">
                {allocations.length > 1 ? (
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={saveMutation.isPending || splitMutation.isPending} title="Распределить общий объём часов и часы периодов поровну между участниками" onClick={() => splitEvenly(item.id, allocations)}>
                    <Equal className="h-3.5 w-3.5" />{splitMutation.isPending ? 'Делим часы…' : 'Разделить поровну'}
                  </Button>
                ) : null}
                {!allocations.length ? renderDefaultPerson() : null}
                {allocations.map(renderAssignment)}
                {!isEpic ? rolePeople.length ? (
                  <AllocationEditor item={item} role={role} people={rolePeople} defaultPersonExternalId={role.defaultPersonExternalId} saving={saveMutation.isPending} onSave={(data) => saveMutation.mutate(data)} />
                ) : (
                  <div className="px-1 pt-1 text-[11px] text-muted-foreground">
                    <p>{people.length ? 'К роли не добавлены участники' : 'Список участников Azure DevOps не синхронизирован'}</p>
                    {canConfigure ? <Link href={people.length ? routes.roadmapAdminRoles : routes.roadmapAdminUsers} className="mt-1 inline-flex text-primary hover:underline">{people.length ? 'Добавить людей в роль' : 'Синхронизировать пользователей'}</Link> : <p className="mt-1">Попросите администратора настроить участников роли.</p>}
                  </div>
                ) : null}
              </div>}
            </td>
          );
        })}
        {!roles.length ? <td className="min-w-52 px-3 py-3 text-xs text-muted-foreground">Роль не настроена</td> : null}
        <td className={`whitespace-nowrap px-4 py-3 text-right text-sm font-medium tabular-nums text-foreground ${isEpic ? 'bg-muted/30' : ''}`}>
          {view === 'roles'
            ? `${itemHours} ч`
            : `${periods.reduce((sum, period) => sum + Number(period.hours), 0)} ч`}
        </td>
      </tr>
    );
  }

  const errors = [connectionQuery.error, projectsQuery.error, peopleQuery.error, planQuery.error, syncMutation.error, saveMutation.error, saveQuarterMutation.error, splitMutation.error, addRoleMutation.error, setRoleDefaultMutation.error, roleCatalogQuery.error];

  return (
    <main className="min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-[1500px] space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Планирование ресурсов</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">План проекта</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AzureProjectPicker
                projects={projects}
                value={selectedAzureProjectId}
                onChange={setSelectedAzureProjectId}
                disabled={projectsQuery.isLoading}
                placeholder={configured ? 'Выбрать проект Azure DevOps' : 'Выбрать локальный проект'}
              />
              <Button
                onClick={() => selectedProject && syncMutation.mutate(selectedProject)}
                disabled={!selectedProject || syncMutation.isPending || usingCachedProjects}
                className="gap-2"
              >
                {syncMutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4" />}
                {usingCachedProjects ? 'Azure недоступен' : selectedProject?.imported ? 'Синхронизировать' : 'Импортировать'}
              </Button>
            </div>
          </div>

          {!configured ? (
            <section className="rounded-xl border border-primary/20 bg-primary/[0.035] p-5">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-primary/10 p-2 text-primary"><ArrowDownToLine className="h-5 w-5" /></div>
                <div>
                  <h2 className="font-medium text-foreground">Azure DevOps не подключён</h2>
                  <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">
                    {canConfigure
                      ? 'Откройте администрирование Roadmap, чтобы подключить организацию и настроить импорт.'
                      : 'Попросите администратора Roadmap настроить интеграцию с Azure DevOps.'}
                  </p>
                  {canConfigure ? (
                    <Link href={routes.roadmapAdmin} className="mt-3 inline-flex h-9 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:opacity-90">
                      Открыть интеграции
                    </Link>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}
          {usingCachedProjects ? <div role="status" className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">Azure DevOps временно недоступен. Показаны ранее импортированные проекты из локальной базы; планирование и демо-назначения доступны.</div> : null}
          {errors.map((error, index) => error ? <ErrorMessage key={index} error={error} /> : null)}

          {plan ? (
            <>
              <section className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-xs text-muted-foreground">Эпики и фичи</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{plan.workItems.length}</p>
                </div>
                <div className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-xs text-muted-foreground">{view === 'periods' ? `План Q${quarterSelection.quarter}` : 'Общая оценка'}</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums text-foreground">{view === 'periods' ? quarterTotalHours : totalHours} <span className="text-sm font-normal text-muted-foreground">часов</span></p>
                </div>
                <div className="rounded-xl border border-border bg-card px-4 py-3">
                  <p className="text-xs text-muted-foreground">Участники в плане</p>
                  <p className="mt-1 flex items-center gap-2 text-xl font-semibold tabular-nums text-foreground"><Users className="h-4 w-4 text-muted-foreground" />{assignedPeopleCount}</p>
                </div>
              </section>

              {focusMode ? <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" aria-hidden="true" /> : null}
              <section
                role={focusMode ? 'dialog' : undefined}
                aria-modal={focusMode ? true : undefined}
                aria-label={focusMode ? 'Режим заполнения плана' : undefined}
                className={focusMode
                  ? 'fixed inset-3 z-50 flex h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl'
                  : 'overflow-hidden rounded-xl border border-border bg-card'}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div>
                    <h2 className="font-medium text-foreground">{plan.name}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {plan.syncedAt ? `Синхронизировано ${new Date(plan.syncedAt).toLocaleString('ru-RU')}` : 'Данные ещё не синхронизированы'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canConfigure ? <Link href={routes.roadmapAdminRoles} className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-muted"><Users className="h-4 w-4" />Управление ролями</Link> : null}
                    <Button type="button" variant={focusMode ? 'secondary' : 'outline'} size="sm" onClick={() => {
                      if (!focusMode && view === 'periods') setExpandedEpics(new Set(epics.map((epic) => epic.id)));
                      setFocusMode((current) => !current);
                    }} className="h-9 gap-2" aria-label={focusMode ? 'Выйти из режима фокуса' : 'Включить режим фокуса'}>
                      {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                      {focusMode ? 'Выйти' : 'Фокус'}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
                  <div className="flex items-center gap-1">
                    <Button type="button" size="sm" variant={view === 'roles' ? 'secondary' : 'ghost'} onClick={() => setView('roles')} className="h-8 gap-1.5"><Users className="h-3.5 w-3.5" />По ролям</Button>
                    <Button type="button" size="sm" variant={view === 'periods' ? 'secondary' : 'ghost'} onClick={() => setView('periods')} className="h-8 gap-1.5"><Clock3 className="h-3.5 w-3.5" />По периодам</Button>
                  </div>
                  {view === 'periods' ? <div className="flex flex-wrap items-center gap-2">
                    {focusMode ? <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setExpandedEpics(allEpicsExpanded ? new Set() : new Set(epics.map((epic) => epic.id)))}>{allEpicsExpanded ? 'Свернуть всё' : 'Развернуть всё'}</Button> : null}
                    <Button type="button" variant={showUnassignedPeriods ? 'secondary' : 'outline'} size="sm" className="h-8" onClick={() => setShowUnassignedPeriods((value) => !value)}>{showUnassignedPeriods ? 'Скрыть без назначений' : 'Показать без назначений'}</Button>
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Предыдущий квартал" onClick={() => shiftQuarter(-1)}><ChevronLeft className="h-4 w-4" /></Button>
                    <span className="min-w-20 text-center text-xs font-semibold tabular-nums">Q{quarterSelection.quarter} {quarterSelection.year}</span>
                    <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Следующий квартал" onClick={() => shiftQuarter(1)}><ChevronRight className="h-4 w-4" /></Button>
                    </div>
                  </div> : null}
                </div>

                {roles.length && !people.length && configured ? <div className="border-b border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">Чтобы назначать людей на роли, сначала синхронизируйте пользователей Azure DevOps в администрировании Roadmap.</div> : null}

                {!plan.workItems.length ? (
                  <div className="px-6 py-12 text-center text-sm text-muted-foreground">В проекте пока нет эпиков или фич. Синхронизируйте его с Azure DevOps.</div>
                ) : (
                  <div className={focusMode ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'overflow-auto'}>
                    {!roles.length ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">Эпики и связанные фичи загружены</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">Добавьте роли и закрепите за ними сотрудников, чтобы распределять часы по фичам.</p>
                        </div>
                        {canConfigure ? <Link href={routes.roadmapAdminRoles} className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground hover:bg-muted"><Users className="h-4 w-4" />Настроить роли</Link> : null}
                      </div>
                    ) : null}
                    {view === 'periods' ? <QuarterPlanningGrid
                      epics={epics}
                      features={features}
                      months={currentQuarterMonths}
                      roles={roles}
                      canConfigure={canConfigure}
                      saving={saveQuarterMutation.isPending || saveMutation.isPending}
                      focusMode={focusMode}
                      showUnassigned={showUnassignedPeriods}
                      expandedEpics={expandedEpics}
                      onToggleEpic={(epicId) => setExpandedEpics((current) => {
                        const next = new Set(current);
                        if (next.has(epicId)) next.delete(epicId);
                        else next.add(epicId);
                        return next;
                      })}
                      onSaveQuarter={saveQuarter}
                      onAddAssignment={(data) => saveMutation.mutate(data)}
                    /> : <div className={focusMode ? 'min-h-0 flex-1 overflow-auto' : undefined}><table className="w-full min-w-max border-collapse text-left">
                      <thead className="sticky top-0 z-[1] bg-muted/80">
                        <tr className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <th className="min-w-72 px-4 py-2.5"><div className="flex items-center justify-between gap-3"><span>Эпик / фича</span>{canConfigure ? <Popover open={rolePickerOpen} onOpenChange={setRolePickerOpen}>
                            <PopoverTrigger asChild><Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1 px-2.5 text-xs" disabled={!roadmapProjectId || addRoleMutation.isPending}><Plus className="h-3.5 w-3.5" />Добавить роль</Button></PopoverTrigger>
                            <PopoverContent align="start" side="bottom" sideOffset={8} collisionPadding={16} className="w-[min(320px,calc(100vw-2rem))] rounded-xl p-2">
                              <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Роли из каталога</p>
                              {roleCatalogQuery.isLoading ? <p className="px-2 py-4 text-center text-sm text-muted-foreground">Загружаем каталог…</p> : (roleCatalogQuery.data ?? []).filter((template) => !roles.some((role) => role.name === template.name)).length ? (roleCatalogQuery.data ?? []).filter((template) => !roles.some((role) => role.name === template.name)).map((template) => <button key={template.id} type="button" disabled={addRoleMutation.isPending} onClick={() => addRoleMutation.mutate(template.id)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: template.color }} /><span className="min-w-0 flex-1 truncate">{template.name}</span>{template.isMock ? <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase text-amber-700 dark:text-amber-300">демо</span> : null}<Plus className="h-3.5 w-3.5 text-muted-foreground" /></button>) : <div className="px-2 py-3 text-sm text-muted-foreground">{(roleCatalogQuery.data ?? []).length ? 'Все роли из каталога уже добавлены.' : 'Каталог ролей пуст.'}{!(roleCatalogQuery.data ?? []).length ? <Link href={routes.roadmapAdminRoles} className="mt-1 block text-primary hover:underline">Создать роли в администрировании</Link> : null}</div>}
                            </PopoverContent>
                          </Popover> : null}</div></th>
                          {roles.map((role) => <th key={role.id} className="min-w-52 px-3 py-2.5">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: role.color }} /><span>{role.name}</span>{role.isMock ? <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium normal-case text-amber-700 dark:text-amber-300">демо</span> : null}</div>
                              {canConfigure ? <Popover open={defaultRolePickerId === role.id} onOpenChange={(open) => setDefaultRolePickerId(open ? role.id : null)}>
                                <PopoverTrigger asChild><button type="button" className="flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[10px] font-medium normal-case text-muted-foreground transition-colors hover:bg-background hover:text-foreground"><Users className="h-3 w-3 shrink-0" /><span className="truncate">{role.defaultPersonName ? `По умолчанию: ${role.defaultPersonName}` : 'Закрепить человека по умолчанию'}</span></button></PopoverTrigger>
                                <PopoverContent align="start" side="bottom" sideOffset={6} collisionPadding={16} className="w-[min(300px,calc(100vw-2rem))] rounded-xl p-2">
                                  <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Человек по умолчанию · {role.name}</p>
                                  {(role.members ?? []).filter((member) => member.personIsActive).map((member) => <button key={member.personExternalId} type="button" disabled={setRoleDefaultMutation.isPending || role.defaultPersonExternalId === member.personExternalId} onClick={() => setRoleDefaultMutation.mutate({ roleId: role.id, personExternalId: member.personExternalId })} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-60"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{member.personName.slice(0, 1)}</span><span className="min-w-0 flex-1"><span className="block truncate">{member.personName}</span><span className="block truncate text-[10px] text-muted-foreground">{member.personEmail}</span></span>{role.defaultPersonExternalId === member.personExternalId ? <Check className="h-4 w-4 text-primary" /> : null}</button>)}
                                  {!(role.members ?? []).some((member) => member.personIsActive) ? <div className="px-2 py-3 text-sm text-muted-foreground">Сначала добавьте участника в эту роль в администрировании.</div> : null}
                                  {role.defaultPersonExternalId ? <button type="button" disabled={setRoleDefaultMutation.isPending} onClick={() => setRoleDefaultMutation.mutate({ roleId: role.id, personExternalId: null })} className="mt-1 w-full rounded-lg border-t border-border px-2 py-2 text-left text-xs text-muted-foreground hover:text-foreground">Снять назначение по умолчанию</button> : null}
                                </PopoverContent>
                              </Popover> : role.defaultPersonName ? <span className="block truncate text-[10px] font-medium normal-case text-muted-foreground">По умолчанию: {role.defaultPersonName}</span> : null}
                            </div>
                          </th>)}
                          {!roles.length ? <th className="min-w-52 px-3 py-3">Роль / участник</th> : null}
                          <th className="min-w-24 px-4 py-3 text-right">{view === 'roles' ? 'Всего' : 'По периодам'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {epics.map((epic) => {
                          const children = features.filter((feature) => feature.parentExternalId === epic.externalId);
                          const collapsed = !expandedEpics.has(epic.id);
                          return <Fragment key={epic.id}>
                            {renderItemRow(epic, true, children.length, collapsed, () => setExpandedEpics((current) => {
                              const next = new Set(current);
                              if (next.has(epic.id)) next.delete(epic.id);
                              else next.add(epic.id);
                              return next;
                            }))}
                            {!collapsed ? children.map((feature) => renderItemRow(feature)) : null}
                          </Fragment>;
                        })}
                        {features.filter((feature) => !feature.parentExternalId || !epics.some((epic) => epic.externalId === feature.parentExternalId)).map((feature) => renderItemRow(feature))}
                      </tbody>
                      <tfoot className="border-t-2 border-border bg-muted/60">
                        <tr className="text-sm font-semibold text-foreground">
                          <th scope="row" className="px-4 py-3">Итого по проекту</th>
                          {roles.map((role) => {
                            const roleAllocations = plannedItems.flatMap((item) => item.allocations.filter((allocation) => allocation.roleId === role.id));
                            const hours = roleAllocations.reduce((sum, allocation) => sum + (view === 'roles'
                              ? Number(allocation.estimatedHours)
                              : allocation.periods.reduce((periodSum, period) => periodSum + Number(period.hours), 0)), 0);
                            return <td key={role.id} className="px-3 py-3 tabular-nums">{hours} ч</td>;
                          })}
                          {!roles.length ? <td className="px-3 py-3 text-muted-foreground">—</td> : null}
                          <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">{view === 'roles' ? totalHours : plannedItems
                            .flatMap((item) => item.allocations)
                            .reduce((sum, allocation) => sum + allocation.periods.reduce((periodSum, period) => periodSum + Number(period.hours), 0), 0)} ч</td>
                        </tr>
                      </tfoot>
                    </table></div>}
                  </div>
                )}
              </section>
            </>
          ) : configured ? (
            <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
              {projectsQuery.isLoading ? <RefreshCw className="mx-auto h-6 w-6 animate-spin text-muted-foreground" /> : <ArrowDownToLine className="mx-auto h-7 w-7 text-muted-foreground" />}
              <p className="mt-3 text-sm text-muted-foreground">
                {projectsQuery.isLoading ? 'Загружаем проекты Azure DevOps…' : selectedProject ? 'Импортируйте выбранный проект, чтобы создать план.' : 'Выберите проект Azure DevOps выше.'}
              </p>
            </div>
          ) : null}
        </div>
    </main>
  );
}
