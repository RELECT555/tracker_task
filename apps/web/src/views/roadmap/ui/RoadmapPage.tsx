'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aggregateRoadmapSummaries, azureRoleEstimate, getRoadmapFactRoots, getRoadmapRolePlan, getRoadmapSummary } from '@tracker/shared';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { AlertCircle, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Cloud, Equal, ExternalLink, ListChecks, Maximize2, Minimize2, Pencil, Plus, RefreshCw, UserRoundPlus, Users, X } from 'lucide-react';
import { useAuth } from '@/features/auth/model/useAuth';
import { isAdminUser } from '@/features/auth/lib/is-admin';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { AzureProjectPicker } from '@/entities/roadmap/ui/AzureProjectPicker';
import { AzureWorkItemIcon } from '@/entities/roadmap/ui/AzureWorkItemIcon';
import { WorkItemStateBadge } from '@/entities/roadmap/ui/WorkItemStateBadge';
import { Button } from '@/shared/ui/button';
import { QueryErrorNotice } from '@/shared/ui/error-notice';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { RoleCatalogPicker } from './RoleCatalogPicker';
import { ColorMark, RoleMark } from '@/shared/ui/color-mark';
import {
  getRoadmapMonthlyFact,
  roadmapApi,
  type AzureProject,
  type RoadmapAllocation,
  type RoadmapPeriod,
  type RoadmapProjectsResult,
  type RoadmapRole,
  type RoadmapWorkItem,
} from '@/entities/roadmap/api/roadmapApi';
import { isRoadmapDemoMode } from '@/entities/roadmap/api/roadmapDemo';
import { ALL_ROADMAP_PROJECTS, useRoadmapProject } from '@/entities/roadmap/model/roadmap-project-selection';
import { useRoadmapCatalog } from '@/entities/roadmap/model/use-roadmap-catalog';
import { RoadmapSummaryStrip } from './RoadmapSummaryStrip';
import { getRoadmapRoleFact } from '../model/roadmap-role-fact';
import { type ColumnWidthsApi, type ColumnWidthConfig } from '../model/use-roadmap-column-widths';
import { useRoadmapTablePreferences } from '../model/use-roadmap-table-preferences';
import { getTableAppearanceProps } from '../model/table-appearance';
import { TableAppearanceSettings } from './TableAppearanceSettings';
import { RoadmapToolbarSwitch } from './RoadmapToolbarSwitch';
import { CreatedTasksPanel } from './CreatedTasksPanel';
import { AgentPanel } from '@/features/roadmap-agent/ui/AgentPanel';
import './table-appearance.css';
import { ColumnResizeHandle, planColumnOffset, ResizablePlanTable, type PlanColumn } from './ResizablePlanTable';
import { PlanTableSkeleton, PortfolioTableSkeleton } from './PlanTableSkeleton';

const AzurePushPreview = dynamic(() => import('@/entities/roadmap/ui/AzurePushPreview').then((module) => module.AzurePushPreview), {
  loading: () => <p role="status" className="p-3 text-sm text-muted-foreground">Загружаем предварительный просмотр…</p>,
});
const CreateAzureWorkItem = dynamic(() => import('./CreateAzureWorkItem').then((module) => module.CreateAzureWorkItem), {
  loading: () => <p role="status" className="fixed bottom-4 right-4 z-50 rounded-lg border border-border bg-card px-3 py-2 text-sm">Загружаем форму…</p>,
});
const AllProjectsPlanTable = dynamic(() => import('./AllProjectsPlanTable').then((module) => module.AllProjectsPlanTable), {
  loading: () => <PortfolioTableSkeleton />,
});

const NAME_COLUMN = { defaultWidth: 440, minWidth: 280, grow: true };
const SUMMARY_COLUMN = { defaultWidth: 120, minWidth: 96, maxWidth: 480 };
const ROLE_COLUMN = { defaultWidth: 200, minWidth: 140, grow: true };
const FACT_COLUMN = { defaultWidth: 100, minWidth: 80, maxWidth: 480 };
const DELTA_COLUMN = { defaultWidth: 90, minWidth: 80, maxWidth: 480 };
type ColumnWidths = ColumnWidthsApi;

function planColumn(widths: ColumnWidths, id: string, label: string, sizing: ColumnWidthConfig & { grow?: boolean }): PlanColumn & ColumnWidthConfig {
  return { ...sizing, id, label, width: widths.getWidth(id, sizing), customized: widths.hasCustomWidth(id) };
}
const PLAN_REFRESH_INTERVAL = 60_000;
const EMPTY_OVERVIEW = aggregateRoadmapSummaries([]);
const FEATURE_COUNT_PLURALS = new Intl.PluralRules('ru-RU');
// Monthly (period) planning is temporarily disabled; stored month values are kept untouched.
const PERIOD_PLANNING_ENABLED = false;

type AllocationInput = Omit<Parameters<typeof roadmapApi.saveAllocation>[0], 'quarterKey'>;

/** Allocations that still have to reach Azure DevOps (never sent, waiting, or failed). */
function needsAzurePush(allocation: RoadmapAllocation) {
  return allocation.azureSyncStatus !== 'synced' && allocation.azureSyncStatus !== 'skipped';
}

function memberParticipation(role: RoadmapRole, personExternalId: string) {
  const members = role.members ?? [];
  const index = members.findIndex((member) => member.personExternalId === personExternalId);
  if (index < 0) return 0;
  return members[index].allocationPercent
    ?? (Math.floor(10_000 / members.length) + Number(index < 10_000 % members.length)) / 100;
}

function AzureSyncMark({ allocation }: { allocation: RoadmapAllocation }) {
  if (allocation.azureSyncStatus === 'pending') return <RefreshCw className="h-3 w-3 shrink-0 animate-spin text-amber-600 dark:text-amber-300" aria-label="Отправляется в Azure DevOps" />;
  if (allocation.azureSyncStatus === 'sending') return <RefreshCw className="h-3 w-3 shrink-0 animate-spin text-sky-600 dark:text-sky-300" aria-label="Задача отправляется в Azure DevOps" />;
  if (allocation.azureSyncStatus === 'error') return <AlertCircle className="h-3 w-3 shrink-0 text-destructive" aria-label="Ошибка отправки в Azure DevOps" />;
  if (allocation.azureSyncStatus === 'conflict') return <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600 dark:text-amber-300" aria-label="Конфликт с изменением в Azure DevOps" />;
  if (allocation.azureSyncStatus === 'synced') return null;
  if (allocation.azureSyncStatus === 'skipped') return <span className="h-1.5 w-1.5 shrink-0 rounded-full border border-muted-foreground/50" aria-label="Не отправляется в Azure DevOps" />;
  return <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground/40" aria-label="Ещё не отправлено в Azure DevOps" />;
}

function AzureTaskPanel({ allocation, onRetry, retrying }: { allocation: RoadmapAllocation; onRetry?: () => void; retrying: boolean }) {
  const status = allocation.azureSyncStatus;
  const label = status === 'synced' ? 'Задача синхронизирована'
    : status === 'pending' ? 'Отправляем в Azure DevOps…'
      : status === 'sending' ? 'Задача отправляется в Azure DevOps…'
      : status === 'error' ? 'Не удалось отправить'
        : status === 'conflict' ? 'Конфликт изменений'
        : status === 'skipped' ? 'Не отправляется'
          : 'Ещё не отправлено';
  return <div className="space-y-2 rounded-lg border border-border px-3 py-2.5 text-xs">
    <div className="flex items-center justify-between gap-2">
      <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground"><AzureSyncMark allocation={allocation} />{label}</span>
      {allocation.azureTaskUrl ? <a href={allocation.azureTaskUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-1 text-primary hover:underline">Task #{allocation.azureTaskId}<ExternalLink className="h-3 w-3" /></a> : null}
    </div>
    <p className="text-muted-foreground">
      План {Number(allocation.estimatedHours)} ч · факт {Number(allocation.actualHours ?? 0)} ч{allocation.azureTaskState ? ` · ${allocation.azureTaskState}` : ''}
    </p>
    {allocation.azureSyncError ? <p className="break-words text-destructive">{allocation.azureSyncError}</p> : null}
    {onRetry && status !== 'synced' && status !== 'pending' && status !== 'sending' ? <Button type="button" size="sm" variant="outline" className="h-7 gap-1.5 text-xs" disabled={retrying} onClick={onRetry}><ArrowUpFromLine className="h-3.5 w-3.5" />{retrying ? 'Отправляем…' : 'Отправить снова'}</Button> : null}
  </div>;
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

function monthOptionLabel(month: QuarterMonth) {
  return `${month.label.charAt(0).toUpperCase()}${month.label.slice(1)} · ${month.monthKey.slice(2)}`;
}

const hoursFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, useGrouping: false });

function displayHours(hours: number | string | null) {
  return hours === null ? '—' : `${hoursFormat.format(Number(hours))} ч`;
}

/** Table cell value: the unit lives in the column header, and zero reads as empty. */
function cellHours(hours: number | string | null) {
  return hours === null || Number(hours) === 0 ? '—' : hoursFormat.format(Number(hours));
}

function unattributedFact(total: number, byRole?: Map<string, number>) {
  let attributed = 0;
  for (const hours of byRole?.values() ?? []) attributed += hours;
  return Number((total - attributed).toFixed(2));
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
      if (event.key === 'Enter') {
        // Like a spreadsheet: Enter moves down the month column, Shift+Enter up. Arrow keys stay with the number spinner.
        const below = event.currentTarget.closest('table')?.querySelector<HTMLInputElement>(
          `[data-quarter-cell="true"][data-quarter-row="${rowIndex + (event.shiftKey ? -1 : 1)}"][data-quarter-month="${monthIndex}"]`,
        );
        event.preventDefault();
        if (below) below.focus(); // leaving the cell saves it through onBlur
        else event.currentTarget.blur();
      }
      if (event.key === 'Escape') { setDraft(hours ? String(hours) : ''); event.currentTarget.blur(); }
      if (event.key === 'Tab') {
        const cells = Array.from(event.currentTarget.closest('table')?.querySelectorAll<HTMLInputElement>('[data-quarter-cell="true"]') ?? []);
        const next = cells[cells.indexOf(event.currentTarget) + (event.shiftKey ? -1 : 1)];
        if (next) { event.preventDefault(); next.focus(); }
      }
    }}
    className="h-9 w-20 rounded-md border border-border/70 bg-card px-2 text-right text-sm font-medium tabular-nums text-foreground outline-none transition-colors placeholder:text-muted-foreground/50 hover:border-primary/40 hover:bg-primary/[0.025] focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
  />;
}

function QuarterAssignmentButton({ item, roles, saving, roleSettingsHref, onSave }: {
  item: RoadmapWorkItem;
  roles: RoadmapRole[];
  saving: boolean;
  roleSettingsHref?: string;
  onSave: (data: AllocationInput) => void;
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
    const availableMembers = firstRole?.members?.filter((member) => member.personIsActive && !item.allocations.some((allocation) => allocation.roleId === firstRole.id && allocation.personExternalId === member.personExternalId)) ?? [];
    setPersonId(availableMembers.length === 1 ? availableMembers[0].personExternalId : '');
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
                const availableMembers = nextRole?.members?.filter((member) => member.personIsActive && !item.allocations.some((allocation) => allocation.roleId === nextRole.id && allocation.personExternalId === member.personExternalId)) ?? [];
                setPersonId(availableMembers.length === 1 ? availableMembers[0].personExternalId : '');
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
          <label className="block space-y-1 text-xs font-medium text-muted-foreground">Оценка на квартал, ч
            <input type="number" min="0" step="0.5" value={hours} onChange={(event) => setHours(event.target.value)} className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground" placeholder="0" />
          </label>
          {!members.length ? <p className="text-xs text-muted-foreground">Все участники этой роли уже назначены.</p> : null}
        </div>
        <div className="flex justify-end border-t border-border bg-muted/20 p-2.5"><Button type="submit" size="sm" disabled={!personId || saving}>{saving ? 'Сохраняем…' : 'Добавить назначение'}</Button></div>
      </form> : <div className="space-y-2 p-3 text-sm"><p className="font-medium">Нет доступных участников</p><p className="text-xs text-muted-foreground">Добавьте участников в роли проекта, чтобы назначить их на работу.</p>{roleSettingsHref ? <Link href={roleSettingsHref} className="inline-flex text-xs font-medium text-primary hover:underline">Настроить роли и участников</Link> : <p className="text-xs text-muted-foreground">Попросите администратора добавить участников в роли.</p>}</div>}
    </PopoverContent>
  </Popover>;
}

function QuarterPlanningGrid({
  epics,
  features,
  months,
  roles,
  roleSettingsHref,
  canEditPlan,
  saving,
  focusMode,
  columnWidths,
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
  roleSettingsHref?: string;
  canEditPlan: boolean;
  saving: boolean;
  focusMode: boolean;
  columnWidths: ColumnWidths;
  showUnassigned: boolean;
  expandedEpics: Set<string>;
  onToggleEpic: (epicId: string) => void;
  onSaveQuarter: (allocation: RoadmapAllocation, values: { monthKey: string; hours: number }[]) => Promise<boolean>;
  onAddAssignment: (data: AllocationInput) => void;
}) {
  const columns = [
    planColumn(columnWidths, 'name', 'Задача / назначение', NAME_COLUMN),
    ...months.map((month, index) => planColumn(columnWidths, `period:month:${index}`, month.label, { defaultWidth: 140, minWidth: 112, maxWidth: 480 })),
    planColumn(columnWidths, 'period:quarter', 'Квартал', { defaultWidth: 150, minWidth: 112, maxWidth: 480 }),
    planColumn(columnWidths, 'period:remaining', 'Не распределено', { defaultWidth: 170, minWidth: 160, maxWidth: 480 }),
  ];
  const monthHours = (allocations: RoadmapAllocation[], monthKey: string) => allocations.reduce((sum, allocation) =>
    sum + allocation.periods.reduce((inner, period) => inner + (period.monthKey === monthKey ? Number(period.hours) : 0), 0), 0);
  const plannedHours = (allocation: RoadmapAllocation) => allocation.periods.reduce((sum, period) => sum + Number(period.hours), 0);
  /** Estimate not yet spread over months; negative when the months exceed the estimate. */
  const unplannedHours = (allocations: RoadmapAllocation[]) => allocations.reduce((sum, allocation) => sum + Number(allocation.estimatedHours) - plannedHours(allocation), 0);
  const quarterHours = (allocations: RoadmapAllocation[]) => months.reduce((sum, month) => sum + monthHours(allocations, month.monthKey), 0);
  const assignments = features.flatMap((feature) => feature.allocations);
  const legacyPeriods = assignments.flatMap((allocation) => allocation.periods.filter((period) => !period.monthKey));
  const legacyHours = legacyPeriods.reduce((sum, period) => sum + Number(period.hours), 0);

  const renderSummary = (item: RoadmapWorkItem, itemAllocations: RoadmapAllocation[], epic = false, isLastChild = false) => (
    <tr key={`summary-${item.id}`} className={`group border-b border-border/70 ${epic ? 'bg-primary/[0.045]' : 'bg-card'}`}>
      <th scope="row" className={`sticky left-0 z-[2] border-r border-border/80 px-4 py-2.5 text-left text-sm text-foreground ${epic ? 'border-l-2 border-l-primary/35 bg-primary/[0.085] font-semibold' : 'bg-card font-medium'}`}>
        <div className={epic ? 'flex min-w-0 items-center gap-2' : `relative flex min-w-0 items-center gap-2 pl-12 before:absolute before:left-0 before:top-[-10px] before:border-l-2 before:border-border/80 after:absolute after:left-0 after:top-3 after:w-5 after:border-t-2 after:border-border/80 ${isLastChild ? 'before:h-5' : 'before:bottom-[-10px]'}`}>
          {epic ? <button type="button" aria-expanded={expandedEpics.has(item.id)} aria-label={`${expandedEpics.has(item.id) ? 'Свернуть' : 'Развернуть'} эпик ${item.title}`} onClick={() => onToggleEpic(item.id)} className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted"><ChevronRight className={`h-4 w-4 transition-transform ${expandedEpics.has(item.id) ? 'rotate-90' : ''}`} /></button> : null}
          <AzureWorkItemIcon type={item.type} />
          <span className="min-w-0 flex-1 truncate" title={item.title}>{item.title}</span>
          {item.actualHours !== null ? <span className="shrink-0 rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-emerald-700 dark:text-emerald-300" title="Фактическое время из Azure DevOps">Факт {Number(item.actualHours)} ч</span> : null}
          {roles.map((role) => {
            const hours = azureRoleEstimate(item, role);
            return hours !== null ? <span key={role.id} className="max-w-44 shrink-0 truncate rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-sky-700 dark:text-sky-300" title={`План Azure · ${role.name}: ${hours} ч`}>{role.name}: {hours} ч</span> : null;
          })}
          <span className="shrink-0 rounded-full bg-background/70 px-2 py-0.5 text-[10px] font-normal text-muted-foreground">{itemAllocations.length} назн.</span>
          {canEditPlan && !epic ? <QuarterAssignmentButton item={item} roles={roles} saving={saving} roleSettingsHref={roleSettingsHref} onSave={onAddAssignment} /> : null}
        </div>
      </th>
      {months.map((month) => <td key={month.monthKey} className="border-b border-border/50 px-3 py-2.5 text-right text-sm tabular-nums text-foreground/80">{monthHours(itemAllocations, month.monthKey) || <span className="text-muted-foreground">—</span>}</td>)}
      <td className="border-b border-l border-primary/15 bg-primary/[0.055] px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">{quarterHours(itemAllocations) || <span className="text-muted-foreground">—</span>}</td>
      <td title={unplannedHours(itemAllocations) < 0 ? 'Распределено больше, чем оценено' : undefined} className={`border-b border-border/50 px-4 py-2.5 text-right text-sm tabular-nums ${unplannedHours(itemAllocations) < 0 ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>{unplannedHours(itemAllocations) || '—'}</td>
    </tr>
  );

  const renderAssignment = (item: RoadmapWorkItem, allocation: RoadmapAllocation, isLastChild: boolean) => {
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

    return <tr key={`allocation-${allocation.id}`} className="group border-b border-border/50 bg-card transition-colors hover:bg-primary/[0.035]">
      <th scope="row" className="sticky left-0 z-[2] min-w-72 border-r border-border/80 bg-card px-4 py-2 text-left font-normal group-hover:bg-muted/30">
        <div className={`relative flex min-w-0 items-center gap-2 pl-16 before:absolute before:left-4 before:top-[-8px] before:border-l-2 before:border-border/70 after:absolute after:left-4 after:top-3 after:w-5 after:border-t-2 after:border-border/70 ${isLastChild ? 'before:h-5' : 'before:bottom-[-8px]'}`}>
          <ColorMark color={allocation.role.color} size="sm" />
          <span className="min-w-0 flex-1 truncate text-[13px] text-foreground" title={`${allocation.role.name} · ${allocation.personName}`}><span className="font-medium">{allocation.role.name}</span><span className="text-muted-foreground"> · {allocation.personName}</span></span>
          {canEditPlan && monthsPlanned > 0 ? <button type="button" disabled={saving} onClick={distributeEvenly} className="shrink-0 rounded px-1.5 py-1 text-[10px] font-medium text-primary hover:bg-primary/10 disabled:opacity-50">Ровно</button> : null}
        </div>
        {allocation.periods.some((period) => !period.monthKey) ? <p className="pl-10 pt-1 text-[10px] text-amber-700 dark:text-amber-300" title={allocation.periods.filter((period) => !period.monthKey).map((period) => `${period.label}: ${period.startsAt.slice(0, 10)}–${period.endsAt.slice(0, 10)}, ${Number(period.hours)} ч`).join('\n')}>Старые периоды: {allocation.periods.filter((period) => !period.monthKey).reduce((sum, period) => sum + Number(period.hours), 0)} ч</p> : null}
      </th>
      {months.map((month, monthIndex) => <td key={month.monthKey} className="border-b border-border/50 px-3 py-1.5 text-right">
        {canEditPlan ? <QuarterHoursCell
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
        /> : displayHours(monthHours([allocation], month.monthKey))}
      </td>)}
      <td className="whitespace-nowrap border-b border-l border-primary/15 bg-primary/[0.055] px-3 py-2 text-right text-sm font-semibold tabular-nums text-foreground">{monthsPlanned || <span className="text-muted-foreground">—</span>}{monthsPlanned ? ' ч' : null}</td>
      <td className={`whitespace-nowrap border-b border-border/50 px-4 py-2 text-right text-xs tabular-nums ${remaining < 0 ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>{remaining < 0 ? `Перепланировано ${Math.abs(remaining)} ч` : `${remaining} ч`}</td>
    </tr>;
  };

  const renderFeature = (feature: RoadmapWorkItem, isLastChild = false) => <Fragment key={`feature-${feature.id}`}>
    {renderSummary(feature, feature.allocations, false, isLastChild)}
    {feature.allocations.map((allocation, index) => renderAssignment(feature, allocation, index === feature.allocations.length - 1))}
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
    <div className={cn('roadmap-scrollbar overflow-auto', focusMode && 'min-h-0 flex-1')}>
      <ResizablePlanTable columns={columns} onColumnResize={(id, width) => columnWidths.commitWidth(id, width, columns.find((column) => column.id === id)!)} onPaste={handlePaste} className="table-fixed border-collapse text-left">
        <thead className="sticky top-0 z-[3] bg-card/95 backdrop-blur">
          <tr className="border-b border-border text-xs font-semibold text-muted-foreground">
            <th scope="col" data-column-id="name" className="sticky left-0 top-0 z-20 border-r border-border/80 bg-muted/90 px-4 py-3 pr-5"><span>Задача / назначение</span><ColumnResizeHandle columnId="name" /></th>
            {months.map((month, index) => <th key={month.monthKey} scope="col" data-column-id={`period:month:${index}`} className="relative px-3 py-3 text-right"><span className="block capitalize text-foreground">{month.label}</span><span className="text-[10px] font-normal">план, ч</span><ColumnResizeHandle columnId={`period:month:${index}`} /></th>)}
            <th scope="col" data-column-id="period:quarter" className="relative border-l border-primary/15 bg-primary/[0.07] px-3 py-3 text-right"><span className="block text-foreground">Квартал</span><span className="text-[10px] font-normal">итого, ч</span><ColumnResizeHandle columnId="period:quarter" /></th>
            <th scope="col" data-column-id="period:remaining" className="relative px-4 py-3 text-right"><span className="block text-foreground">Не распределено</span><span className="text-[10px] font-normal">от оценки, ч</span><ColumnResizeHandle columnId="period:remaining" /></th>
          </tr>
        </thead>
        <tbody>
          {epics.map((epic) => {
            const children = features.filter((feature) => feature.parentExternalId === epic.externalId);
            const visibleChildren = showUnassigned ? children : children.filter((feature) => feature.allocations.length > 0);
            const epicAllocations = visibleChildren.flatMap((feature) => feature.allocations);
            if (!showUnassigned && epicAllocations.length === 0) return null;
            return <Fragment key={`epic-${epic.id}`}>
              {renderSummary(epic, epicAllocations, true)}
              {expandedEpics.has(epic.id) ? visibleChildren.map((feature, index) => renderFeature(feature, index === visibleChildren.length - 1)) : null}
            </Fragment>;
          })}
          {features.filter((feature) => (!feature.parentExternalId || !epics.some((epic) => epic.externalId === feature.parentExternalId)) && (showUnassigned || feature.allocations.length > 0)).map((feature, index, items) => renderFeature(feature, index === items.length - 1))}
        </tbody>
        <tfoot className="sticky bottom-0 z-[3] border-t-2 border-border bg-muted/70 shadow-[0_-4px_12px_rgba(0,0,0,0.04)] backdrop-blur">
          <tr className="text-sm font-semibold text-foreground">
            <th scope="row" className="sticky left-0 z-20 border-r border-border/80 bg-muted/90 px-4 py-3">Итого по проекту</th>
            {months.map((month) => <td key={month.monthKey} className="px-3 py-3 text-right tabular-nums">{monthHours(totalAllocations, month.monthKey)} ч</td>)}
            <td className="border-l border-primary/15 bg-primary/[0.07] px-3 py-3 text-right tabular-nums">{totalQuarter} ч</td>
            <td className="px-4 py-3 text-right text-xs tabular-nums text-muted-foreground">{totalEstimate - totalPlanned} ч</td>
          </tr>
        </tfoot>
      </ResizablePlanTable>
    </div>
  </div>;
}

function AllocationEditor({
  item,
  role,
  people,
  initial,
  initialPersonExternalId,
  triggerLabel,
  triggerClassName,
  quarterLabel,
  trigger,
  onSave,
  saving,
  azure,
}: {
  item: RoadmapWorkItem;
  role: RoadmapRole;
  people: { id: string; name: string; email: string | null; isMock?: boolean }[];
  initial?: RoadmapAllocation;
  /** Shows the linked Azure DevOps Task when plan write-back is enabled. */
  azure?: { onRetry?: (allocationId: string) => void; retrying: boolean };
  initialPersonExternalId?: string;
  triggerLabel?: string;
  triggerClassName?: string;
  quarterLabel: string;
  trigger?: React.ReactElement;
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
  const sourceEstimate = azureRoleEstimate(item, role);

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
    setPersonId(initial?.personExternalId ?? initialPersonExternalId ?? '');
    setHours(initial ? String(initial.estimatedHours) : '');
  };

  return (
    <Popover open={open} onOpenChange={(nextOpen) => { if (nextOpen) startEditing(); setOpen(nextOpen); }}>
      <PopoverTrigger asChild>
        {trigger ?? <Button type="button" variant={initial ? 'ghost' : 'outline'} size="sm" className={triggerClassName ?? (initial ? 'mt-1 h-7 gap-1 px-2 text-xs text-muted-foreground' : 'mt-2 h-8 gap-1.5 px-2.5 text-xs')} aria-label={initial ? `Изменить оценку: ${selectedPerson?.name ?? initial.personExternalId}` : triggerLabel ?? 'Назначить участника'}>
          {initial ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {initial ? 'Изменить назначение' : triggerLabel ?? (initialPersonExternalId ? 'Задать оценку' : 'Добавить участника')}
        </Button>}
      </PopoverTrigger>
      <PopoverContent align="start" side="bottom" sideOffset={8} collisionPadding={16} className="max-h-[min(80vh,680px)] w-[min(390px,calc(100vw-2rem))] overflow-y-auto rounded-xl p-0">
        <form onSubmit={submit}>
          <div className="flex items-start justify-between border-b border-border px-4 py-3">
            <div>
              <h3 className="text-sm font-semibold">{initial ? 'Оценка участника' : 'Назначение участника'}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{role.name} · {item.title} · {quarterLabel}</p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="-mr-2 -mt-1 h-8 w-8" aria-label="Закрыть" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-4 p-4">
            <label className="block space-y-1.5 text-xs font-medium text-muted-foreground">
              Участник
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
              Оценка на {quarterLabel}
              <div className="relative">
                <input type="number" min="0" step="0.5" value={hours} onChange={(event) => setHours(event.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 pr-12 text-sm text-foreground" placeholder="0" />
                <span className="absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground">часов</span>
              </div>
            </label>
            {sourceEstimate !== null ? <p className="text-xs text-muted-foreground">План по роли в Azure DevOps: {sourceEstimate} ч на всю задачу.</p> : null}
            {initial && azure ? <AzureTaskPanel allocation={initial} retrying={azure.retrying} onRetry={azure.onRetry ? () => azure.onRetry?.(initial.id) : undefined} /> : null}
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
  const demoMode = isRoadmapDemoMode();
  const canConfigure = isAdminUser(user);
  const [view, setView] = useState<'roles' | 'periods'>('roles');
  const [focusMode, setFocusMode] = useState(false);
  const tableSettings = useRoadmapTablePreferences(user?.id);
  const { preferences } = tableSettings;
  const columnWidths = tableSettings.columnWidths;
  const appearanceProps = getTableAppearanceProps(preferences);
  const appearanceSettings = <TableAppearanceSettings preferences={preferences} onChange={tableSettings.change} onReset={tableSettings.reset} status={tableSettings.status} onRetry={tableSettings.retry} disabled={!tableSettings.ready} hasCustomWidths={columnWidths.hasCustomWidths} onResetWidths={columnWidths.resetWidths} />;
  const [showUnassignedPeriods, setShowUnassignedPeriods] = useState(false);
  const pinnedColumns = preferences.pinnedColumns;
  const [quarterSelection, setQuarterSelection] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
  });
  const [selectedMonthKey, setSelectedMonthKey] = useState('');
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(() => new Set());
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const createEpicTrigger = useRef<HTMLButtonElement>(null);
  const [createTarget, setCreateTarget] = useState<{
    externalProjectId: string;
    type: 'Epic' | 'Feature';
    parentExternalId?: string;
    trigger: HTMLButtonElement;
  } | null>(null);

  useEffect(() => {
    if (!focusMode) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !document.querySelector('dialog[open]')) setFocusMode(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [focusMode]);

  const connectionQuery = useQuery({ queryKey: ['roadmap', 'connection'], queryFn: roadmapApi.connection, enabled: canConfigure });
  const configured = connectionQuery.data?.configured ?? false;
  const { projects, azureProjects, azureQuery: projectsQuery, localQuery, loading: catalogLoading } = useRoadmapCatalog(canConfigure && !demoMode);
  const peopleQuery = useQuery({ queryKey: ['roadmap', 'people'], queryFn: roadmapApi.people, enabled: canConfigure });
  const roleCatalogQuery = useQuery({ queryKey: ['roadmap', 'admin', 'role-catalog'], queryFn: roadmapApi.roleCatalog, enabled: canConfigure && rolePickerOpen });
  const people = peopleQuery.data?.data ?? [];
  const needsPeopleSync = canConfigure && peopleQuery.isSuccess && people.length === 0;
  const usingCachedProjects = projectsQuery.data?.source === 'cache';
  const { project: selectedProject, savedProject, ready: projectSelectionReady, selectProject, isAllProjects } = useRoadmapProject(projects, { allowAll: true, catalogLoading: projectsQuery.isLoading });
  const activeAzureProjectId = isAllProjects ? ALL_ROADMAP_PROJECTS : selectedProject?.id ?? '';
  const savedPlanId = !isAllProjects && !selectedProject && (!projectsQuery.data || localQuery.isLoading) ? savedProject.roadmapId : undefined;
  const roadmapProjectId = savedPlanId ?? selectedProject?.roadmapId ?? '';
  const showRoleDetails = preferences.showRoleDetails;
  const setRoleBreakdown = (expanded: boolean) => tableSettings.change({ showRoleDetails: expanded });
  const projectIsSynced = Boolean(selectedProject?.imported && selectedProject.planSynced !== false);
  const azureProject = projectsQuery.data?.source === 'azure' ? azureProjects.find((project) => project.id === selectedProject?.id) : undefined;
  const canImportProject = Boolean(canConfigure && !demoMode && configured && azureProject && !projectIsSynced);
  const roleSettingsHref = roadmapProjectId ? `${routes.roadmapAdminRoles}?projectId=${encodeURIComponent(roadmapProjectId)}` : routes.roadmapAdminRoles;

  const planQuery = useQuery({
    queryKey: ['roadmap', 'plan', roadmapProjectId],
    queryFn: () => roadmapApi.plan(roadmapProjectId),
    enabled: Boolean(roadmapProjectId),
    // The server pulls Azure changes. An open plan periodically reads the latest local data.
    refetchInterval: (query) => query.state.data?.azure?.writeBackEnabled
      && query.state.data.workItems.some((item) => item.allocations.some((allocation) => allocation.azureSyncStatus === 'pending' || allocation.azureSyncStatus === 'sending'))
      ? 3000
      : !demoMode && projectIsSynced ? PLAN_REFRESH_INTERVAL : false,
  });
  const plan = !planQuery.isError && (!savedPlanId || planQuery.data?.externalId === savedProject.projectId)
    ? planQuery.data
    : undefined;
  const canEditPlan = plan?.canEditPlan === true || (demoMode && canConfigure);
  const lastPlanImport = useRef<{ projectId: string; syncedAt: string } | null>(null);
  const syncedAt = plan?.syncedAt;
  useEffect(() => {
    const previous = lastPlanImport.current;
    lastPlanImport.current = syncedAt ? { projectId: roadmapProjectId, syncedAt } : null;
    if (!demoMode && syncedAt && previous?.projectId === roadmapProjectId && previous.syncedAt !== syncedAt) {
      void queryClient.invalidateQueries({ queryKey: ['roadmap', 'monthly-fact', roadmapProjectId] });
    }
  }, [demoMode, queryClient, roadmapProjectId, syncedAt]);
  const createdTaskIds = new Set(plan?.azure?.createdTaskIds);
  const createdTasks = plan?.workItems.filter((item) => createdTaskIds.has(item.externalId)) ?? [];
  const createProject = canConfigure && configured && !demoMode ? azureProject : undefined;
  const canCreateWorkItem = Boolean(createProject && plan?.externalId === createProject.id);
  function openCreateWorkItem(trigger: HTMLButtonElement, parentExternalId?: string) {
    if (!createProject || !canCreateWorkItem) return;
    setCreateTarget({ externalProjectId: createProject.id, type: parentExternalId ? 'Feature' : 'Epic', parentExternalId, trigger });
  }
  const currentQuarterKey = `${quarterSelection.year}-Q${quarterSelection.quarter}`;
  const currentQuarterLabel = `Q${quarterSelection.quarter} ${quarterSelection.year}`;
  const currentQuarterMonths = quarterMonths(quarterSelection.year, quarterSelection.quarter);
  const selectedMonth = view === 'roles' ? currentQuarterMonths.find((month) => month.monthKey === selectedMonthKey) : undefined;
  const monthlyFactQuery = useQuery({
    queryKey: ['roadmap', 'monthly-fact', roadmapProjectId, selectedMonthKey],
    queryFn: ({ signal }) => getRoadmapMonthlyFact(roadmapProjectId, selectedMonthKey, signal),
    enabled: Boolean(plan && selectedMonth && !demoMode),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const monthlyFact = monthlyFactQuery.data;
  const roles = plan?.roles ?? [];
  const plannedRolesOnly = preferences.plannedRolesOnly;
  const availableRoleTemplates = (roleCatalogQuery.data ?? []).filter((template) => !roles.some((role) => role.name === template.name));
  const writeBackEnabled = Boolean(plan?.azure?.writeBackEnabled);
  const canPushToAzure = plan?.azure?.canPush === true;
  const allAllocations = plan?.workItems.flatMap((item) => item.allocations) ?? [];
  const azureUnsyncedCount = allAllocations.filter(needsAzurePush).length;
  const azureErrorCount = allAllocations.filter((allocation) => allocation.azureSyncStatus === 'error').length;

  const syncMutation = useMutation({
    mutationFn: (project: AzureProject) => roadmapApi.syncProject(project),
    onSuccess: async (result, syncedProject) => {
      queryClient.setQueryData<RoadmapProjectsResult>(['roadmap', 'azure-projects'], (previous) => previous && ({
        ...previous,
        data: previous.data.map((project) => project.id === syncedProject.id
          ? { ...project, imported: true, planSynced: true, roadmapId: result.projectId }
          : project),
      }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'azure-projects'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'local-projects'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'admin', 'roles'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'roles', result.projectId] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', result.projectId] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'monthly-fact', result.projectId] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'write-back-overview'] }),
      ]);
    },
  });
  const isSelectedProjectSync = syncMutation.variables?.id === activeAzureProjectId;
  const syncResult = isSelectedProjectSync ? syncMutation.data : undefined;
  const saveMutation = useMutation({
    mutationFn: roadmapApi.saveAllocation,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', roadmapProjectId] }),
  });
  const saveQuarterMutation = useMutation({
    mutationFn: ({ allocationId, quarterKey, months }: { allocationId: string; quarterKey: string; months: { monthKey: string; hours: number }[] }) => roadmapApi.saveAllocationQuarter(allocationId, quarterKey, months),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', roadmapProjectId] }),
  });
  const [pushPreviewOpen, setPushPreviewOpen] = useState(false);
  const pushAllocationMutation = useMutation({
    mutationFn: roadmapApi.pushAllocationToAzure,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', roadmapProjectId] }),
  });
  const addRoleMutation = useMutation({
    mutationFn: ({ projectId, templateId }: { projectId: string; templateId: string }) => roadmapApi.addRoleFromCatalog(projectId, templateId),
    onSuccess: async (_, { projectId }) => {
      setRolePickerOpen(false);
      tableSettings.change({ plannedRolesOnly: false });
      setRoleBreakdown(true);
      await queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', projectId] });
    },
  });
  const splitMutation = useMutation({
    mutationFn: roadmapApi.rebalanceAllocations,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', roadmapProjectId] }),
  });
  const monthKey = selectedMonth?.monthKey;
  const summary = useMemo(() => plan ? getRoadmapSummary(plan, {
    quarterKey: currentQuarterKey, monthKey, monthlyFact, plannedRolesOnly,
  }) : undefined, [plan, currentQuarterKey, monthKey, monthlyFact, plannedRolesOnly]);
  const overviewProjects = isAllProjects
    ? azureProjects.filter((project): project is AzureProject & { roadmapId: string } => Boolean(project.imported && project.roadmapId))
    : [];
  const overviewInput = {
    projectIds: overviewProjects.map((project) => project.roadmapId),
    quarterKey: currentQuarterKey,
    monthKey,
    plannedRolesOnly,
  };
  const overviewQuery = useQuery({
    queryKey: ['roadmap', 'portfolio', overviewInput],
    queryFn: ({ signal }) => roadmapApi.projectSummaries({ ...overviewInput, includeMonthlyFact: false }, signal),
    enabled: overviewProjects.length > 0,
    staleTime: 0,
    refetchInterval: demoMode ? false : PLAN_REFRESH_INTERVAL,
  });
  const overviewFactQuery = useQuery({
    queryKey: ['roadmap', 'portfolio', overviewInput, 'monthly-fact'],
    queryFn: ({ signal }) => roadmapApi.projectSummaries(overviewInput, signal),
    enabled: Boolean(overviewProjects.length && monthKey && !demoMode),
    staleTime: 0,
    refetchInterval: PLAN_REFRESH_INTERVAL,
  });
  const overviewData = overviewFactQuery.data ?? overviewQuery.data;
  const overviewLoading = projectsQuery.isLoading || (overviewProjects.length > 0 && overviewQuery.isPending);
  const overviewSummary = overviewData?.totals ?? (
    !overviewLoading && !projectsQuery.isError && !overviewProjects.length ? EMPTY_OVERVIEW : undefined
  );
  const plannedItems = useMemo(() => summary?.items ?? [], [summary]);
  const epics = useMemo(() => plannedItems.filter((item) => item.type.toLowerCase() === 'epic'), [plannedItems]);
  const features = useMemo(() => plannedItems.filter((item) => item.type.toLowerCase() === 'feature'), [plannedItems]);
  const standaloneFeatures = features.filter((feature) => !epics.some((epic) => epic.externalId === feature.parentExternalId));
  const rolePlan = summary?.rolePlan ?? getRoadmapRolePlan([], []);
  const visibleRoles = summary?.visibleRoles ?? [];
  const totalHours = summary?.planHours ?? 0;
  const unattachedPlanHours = Array.from(rolePlan.byUnattached.values()).reduce((sum, hours) => sum + hours, 0);
  const factRoots = getRoadmapFactRoots(plannedItems);
  const totalActualHours = summary?.actualHours ?? (selectedMonth ? null : 0);
  const roleFact = useMemo(() => plan && (!monthKey || monthlyFact)
    ? getRoadmapRoleFact(plan.workItems, plan.roles, monthKey ? monthlyFact : undefined)
    : undefined, [plan, monthKey, monthlyFact]);
  const projectRoleFact = new Map<string, number>(selectedMonth ? roleFact?.byProject : undefined);
  if (!selectedMonth) {
    for (const item of factRoots) {
      for (const [roleId, hours] of roleFact?.byItem.get(item.id) ?? []) {
        projectRoleFact.set(roleId, (projectRoleFact.get(roleId) ?? 0) + hours);
      }
    }
  }
  const projectUnattributedFact = totalActualHours === null ? 0 : unattributedFact(totalActualHours, projectRoleFact);
  let hasUnattributedFact = projectUnattributedFact !== 0;
  for (const item of [...epics, ...features]) {
    const byRole = roleFact?.byItem.get(item.id);
    if (item.actualHours !== null && unattributedFact(Number(item.actualHours), byRole)) hasUnattributedFact = true;
  }
  const detailRoles = showRoleDetails ? visibleRoles : [];
  const showUnattributedFact = showRoleDetails && hasUnattributedFact && preferences.showFact;
  const roleMetricCount = 1 + Number(preferences.showFact) + Number(preferences.showDelta);
  const headerRowSpan = detailRoles.length || showUnattributedFact ? 2 : 1;
  const tableColumns = [
    planColumn(columnWidths, 'name', 'Эпик / фича', NAME_COLUMN),
    planColumn(columnWidths, 'summary:plan', 'План', SUMMARY_COLUMN),
    ...(preferences.showFact ? [planColumn(columnWidths, 'summary:fact', 'Факт', SUMMARY_COLUMN)] : []),
    ...detailRoles.flatMap((role) => [
      planColumn(columnWidths, `plan:${role.id}`, `План · ${role.name}`, ROLE_COLUMN),
      ...(preferences.showFact ? [planColumn(columnWidths, `fact:${role.id}`, `Факт · ${role.name}`, FACT_COLUMN)] : []),
      ...(preferences.showDelta ? [planColumn(columnWidths, `delta:${role.id}`, `Дельта · ${role.name}`, DELTA_COLUMN)] : []),
    ]),
    ...(showUnattributedFact ? [planColumn(columnWidths, 'fact:unattributed', 'Факт · Без роли', FACT_COLUMN)] : []),
  ];
  const allEpicsExpanded = epics.length > 0 && epics.every((epic) => expandedEpics.has(epic.id));
  const quarterTotalHours = plannedItems
    .filter((item) => item.type.toLowerCase() === 'feature' || item.type.toLowerCase() === 'epic')
    .flatMap((item) => item.allocations)
    .reduce((sum, allocation) => sum + allocation.periods.reduce((inner, period) => inner + (currentQuarterMonths.some((month) => month.monthKey === period.monthKey) ? Number(period.hours) : 0), 0), 0);

  const shiftQuarter = (offset: number) => {
    setSelectedMonthKey('');
    setQuarterSelection((current) => {
      const date = new Date(current.year, (current.quarter - 1) * 3 + offset * 3, 1);
      return { year: date.getFullYear(), quarter: Math.floor(date.getMonth() / 3) + 1 };
    });
  };
  const saveAllocation = (data: AllocationInput) => saveMutation.mutate({ ...data, quarterKey: currentQuarterKey });
  const saveQuarter = async (allocation: RoadmapAllocation, months: { monthKey: string; hours: number }[]) => {
    try {
      await saveQuarterMutation.mutateAsync({ allocationId: allocation.id, quarterKey: currentQuarterKey, months });
      return true;
    } catch {
      return false;
    }
  };

  const renderFactCell = (hours: number | null, key: string) => (
    <td key={key} className={cn(
      'whitespace-nowrap border-l border-border/40 px-3 py-2.5 text-right text-sm tabular-nums',
      hours ? 'font-medium text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground',
    )}>{cellHours(hours)}</td>
  );

  const pinnedCellClass = (id: string) => (
    pinnedColumns === 'totals' || (pinnedColumns === 'name' && id === 'name')
      ? cn(
        'md:sticky md:left-[var(--roadmap-pinned-left)] md:z-10 md:bg-inherit',
        id === (pinnedColumns === 'totals' ? preferences.showFact ? 'summary:fact' : 'summary:plan' : 'name')
          && 'md:shadow-[1px_0_0_var(--color-border),5px_0_6px_-5px_rgb(0_0_0/0.18)]',
      ) : undefined
  );
  const pinnedCellStyle = (id: string) => ({
    '--roadmap-pinned-left': planColumnOffset(id === 'name' ? [] : id === 'summary:plan' ? ['name'] : ['name', 'summary:plan']),
  } as CSSProperties);
  const renderRoleMetrics = (roleId: string, planned: number, actual: number | null) => {
    const delta = actual === null ? null : Number((actual - planned).toFixed(2));
    return <>
      {preferences.showFact ? renderFactCell(actual, `fact:${roleId}`) : null}
      {preferences.showDelta ? <td key={`delta:${roleId}`} title="Дельта = факт − план" className={cn(
        'whitespace-nowrap border-l border-border/40 px-3 py-2.5 text-right text-sm tabular-nums',
        delta !== null && delta > 0 ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-muted-foreground',
      )}>{delta === null || delta === 0 ? '—' : `${delta > 0 ? '+' : '−'}${cellHours(Math.abs(delta))}`}</td> : null}
    </>;
  };

  function renderItemRow(item: RoadmapWorkItem, isEpic = false, childCount = 0, collapsed = false, onToggle?: () => void, isChild = false, isLastChild = false) {
    const plannedByRole = rolePlan.byItem.get(item.id);
    const itemHours = Array.from(plannedByRole?.values() ?? []).reduce((sum, hours) => sum + hours, 0);
    const actualHours = selectedMonth ? item.actualHours : Number(item.actualHours ?? 0);
    const actualByRole = roleFact?.byItem.get(item.id);
    const featureCountForm = isEpic ? FEATURE_COUNT_PLURALS.select(childCount) : null;
    return (
      <tr key={item.id} data-row-kind={isEpic ? 'epic' : 'feature'} className={`group/row align-top transition-colors ${isEpic ? 'border-t border-border bg-[color-mix(in_srgb,var(--color-muted)_30%,var(--color-card))] hover:bg-[color-mix(in_srgb,var(--color-muted)_45%,var(--color-card))]' : 'border-t border-border/50 bg-card hover:bg-[color-mix(in_srgb,var(--color-muted)_15%,var(--color-card))]'}`}>
        <th scope="row" style={pinnedCellStyle('name')} className={cn('py-2 text-left font-normal', pinnedCellClass('name'), isEpic ? 'px-3 pr-5 inset-shadow-[2px_0_0] inset-shadow-primary/40 sm:px-4 sm:pr-5' : isChild ? 'px-0' : 'px-3 sm:px-4')}>
          {isEpic ? (
            <div className={cn('-ml-1 grid items-start gap-x-2', canCreateWorkItem ? 'grid-cols-[1.75rem_1rem_minmax(0,1fr)_2rem]' : 'grid-cols-[1.75rem_1rem_minmax(0,1fr)]')}>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-expanded={!collapsed}
                aria-label={`${collapsed ? 'Развернуть' : 'Свернуть'} эпик ${item.title}`}
                disabled={!childCount}
                onClick={onToggle}
                className="-mt-1 size-7 text-muted-foreground hover:text-foreground focus-visible:ring-ring motion-reduce:transition-none motion-reduce:active:scale-100"
              >
                {collapsed ? <ChevronRight aria-hidden="true" className="size-4" /> : <ChevronDown aria-hidden="true" className="size-4" />}
              </Button>
              <AzureWorkItemIcon type={item.type} className="mt-0.5" />
              <div className="col-start-3 min-w-0">
                <div data-plan-title title={item.title} className="text-sm leading-5 font-semibold text-foreground [overflow-wrap:anywhere]">{item.title}</div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs leading-4 text-muted-foreground">
                  <span className="min-w-0 tabular-nums [overflow-wrap:anywhere]">Epic #{item.externalId}</span>
                  <WorkItemStateBadge state={item.state} />
                  <span className="rounded-full bg-muted px-2 py-px whitespace-nowrap font-medium tabular-nums text-foreground/70">
                    {childCount} {featureCountForm === 'one' ? 'фича' : featureCountForm === 'few' ? 'фичи' : 'фич'}
                  </span>
                </div>
              </div>
              {canCreateWorkItem ? <Button
                type="button"
                variant="ghost"
                size="icon"
                className="self-center size-8 text-muted-foreground opacity-0 transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/row:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100"
                aria-label={`Создать фичу в эпике ${item.title}`}
                title="Создать фичу"
                aria-haspopup="dialog"
                onClick={(event) => openCreateWorkItem(event.currentTarget, item.externalId)}
              ><Plus aria-hidden="true" className="size-4" /></Button> : null}
            </div>
          ) : (
            <div className={isChild
              ? `relative pl-7 before:absolute before:left-2 before:top-[-8px] before:border-l-2 before:border-border/80 after:absolute after:left-2 after:top-3 after:w-5 after:border-t-2 after:border-border/80 ${isLastChild ? 'before:h-5' : 'before:bottom-[-8px]'}`
              : 'pl-3'}>
              <div className="flex min-w-0 items-start gap-2">
                <AzureWorkItemIcon type={item.type} className="mt-0.5" />
                <span data-plan-title title={item.title} className="min-w-0 text-sm leading-snug [overflow-wrap:anywhere]">{item.title}</span>
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 pl-6 text-[11px] text-muted-foreground">
                <span className="tabular-nums">Feature #{item.externalId}</span>
                <WorkItemStateBadge state={item.state} />
              </div>
            </div>
          )}
        </th>
        <td style={pinnedCellStyle('summary:plan')} className={cn('whitespace-nowrap border-l border-border/60 px-3 py-2.5 text-right text-sm tabular-nums', pinnedCellClass('summary:plan'), itemHours ? 'font-medium text-foreground' : 'text-muted-foreground')}>
          {cellHours(itemHours)}
        </td>
        {preferences.showFact ? <td style={pinnedCellStyle('summary:fact')} className={cn('whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums', pinnedCellClass('summary:fact'), Number(actualHours) ? 'font-medium text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}>
          {cellHours(actualHours)}
        </td> : null}
        {detailRoles.map((role) => {
          const planned = plannedByRole?.get(role.id) ?? 0;
          const actual = actualHours === null ? null : actualByRole?.get(role.id) ?? 0;
          const sourceEstimate = !selectedMonth ? azureRoleEstimate(item, role) : null;
          const cellClassName = 'border-l border-border/60 px-1.5 py-1.5';
          if (isEpic) {
            return (
              <Fragment key={role.id}>
                <td className={cn(cellClassName, 'px-3 py-2.5 text-right text-sm tabular-nums', planned ? 'font-medium text-foreground' : 'text-muted-foreground')}>{cellHours(planned)}</td>
                {renderRoleMetrics(role.id, planned, actual)}
              </Fragment>
            );
          }
          const allocations = item.allocations.filter((allocation) => allocation.roleId === role.id);
          const rolePeople = (role.members ?? []).filter((member) => member.personIsActive).map((member) => ({
            id: member.personExternalId, name: member.personName, email: member.personEmail, isMock: member.personIsMock,
          }));
          const unassignedPeople = !selectedMonth ? rolePeople.filter((person) => !allocations.some((allocation) => allocation.personExternalId === person.id)) : [];
          const canEdit = canEditPlan && !selectedMonth && rolePeople.length > 0;
          const editorProps = {
            item, role, people: rolePeople, quarterLabel: currentQuarterLabel, saving: saveMutation.isPending, onSave: saveAllocation,
            azure: writeBackEnabled ? { onRetry: canPushToAzure ? (allocationId: string) => pushAllocationMutation.mutate(allocationId) : undefined, retrying: pushAllocationMutation.isPending } : undefined,
          };
          const personLine = ({ name, email, hours, mock, status }: { name: string; email?: string | null; hours: string; mock?: boolean; status?: React.ReactNode }) => (
            <span className="flex w-full min-w-0 items-center gap-2 px-1.5 py-1 text-left">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{name.slice(0, 1)}</span>
              <span title={email ?? undefined} className="min-w-0 flex-1 truncate text-xs font-medium text-foreground">{name}</span>
              {mock ? <span className="shrink-0 rounded bg-amber-500/10 px-1 py-px text-[9px] font-medium uppercase text-amber-700 dark:text-amber-300">демо</span> : null}
              {status}
              <span className="shrink-0 text-xs font-medium tabular-nums text-foreground">{hours}</span>
            </span>
          );
          const chipClassName = 'group/chip block w-full rounded-md transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';
          const assignmentList = <>
            {allocations.map((allocation) => {
              const line = personLine({
                name: allocation.personName,
                email: allocation.personEmail,
                hours: cellHours(allocation.estimatedHours),
                mock: role.members?.find((member) => member.personExternalId === allocation.personExternalId)?.personIsMock,
                status: writeBackEnabled ? <AzureSyncMark allocation={allocation} /> : undefined,
              });
              return canEdit
                ? <AllocationEditor key={allocation.id} {...editorProps} initial={allocation} trigger={<button type="button" className={chipClassName} aria-label={`Изменить оценку: ${allocation.personName}`}>{line}</button>} />
                : <div key={allocation.id}>{line}</div>;
            })}
          </>;
          // Members without an estimate are not listed in every row; they are one hover-revealed action away.
          const hasContent = allocations.length > 0;
          const actions = canEdit ? <div className="flex items-center gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 motion-reduce:transition-none [@media(hover:none)]:opacity-100">
            {unassignedPeople.length > 0 ? <AllocationEditor {...editorProps} people={unassignedPeople} initialPersonExternalId={unassignedPeople.length === 1 ? unassignedPeople[0].id : undefined} trigger={<button type="button" className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground" aria-label={`Назначить участника роли «${role.name}»: ${item.title}`}><Plus aria-hidden="true" className="h-3 w-3" />{hasContent ? 'Участник' : 'Назначить'}</button>} /> : null}
            {allocations.length > 1 ? <button type="button" disabled={saveMutation.isPending || splitMutation.isPending} title="Распределить часы поровну между участниками" onClick={() => splitMutation.mutate(allocations.map(({ id }) => id))} className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"><Equal className="h-3 w-3" />{splitMutation.isPending ? 'Делим…' : 'Поровну'}</button> : null}
          </div> : null;
          return (
            <Fragment key={role.id}>
            <td className={cellClassName}>
              <div className={cn('flex items-center justify-end px-1.5 py-1 text-sm tabular-nums', planned ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                {!allocations.length && sourceEstimate !== null && planned ? <span title="Оценка Azure DevOps на всю карточку, без назначений" className="underline decoration-muted-foreground/50 decoration-dotted underline-offset-4">
                  {cellHours(planned)}<span className="sr-only"> (оценка Azure DevOps)</span>
                </span> : cellHours(planned)}
              </div>
              <div className="space-y-0.5">
                {assignmentList}
                {actions}
              </div>
            </td>
            {renderRoleMetrics(role.id, planned, actual)}
            </Fragment>
          );
        })}
        {showUnattributedFact ? renderFactCell(actualHours === null ? null : unattributedFact(Number(actualHours), actualByRole), 'unattributed') : null}
      </tr>
    );
  }

  const loadQueries = [projectsQuery, ...(canConfigure ? [localQuery, connectionQuery, peopleQuery, roleCatalogQuery] : []), ...(roadmapProjectId ? [planQuery] : []), ...(overviewProjects.length ? [overviewQuery] : [])];
  const mutationErrors = [isSelectedProjectSync ? syncMutation.error : null, saveMutation.error, saveQuarterMutation.error, splitMutation.error, addRoleMutation.error, pushAllocationMutation.error];
  const loadingMessage = planQuery.isLoading
    ? 'Загружаем план проекта…'
    : catalogLoading || (projectsQuery.isLoading && !selectedProject) || !projectSelectionReady
      ? 'Загружаем список проектов…'
      : connectionQuery.isLoading
        ? 'Проверяем подключение к Azure DevOps…'
        : null;
  const emptyPlanMessage = !isAllProjects && projectSelectionReady && configured && !projectsQuery.isError && !roadmapProjectId
    ? selectedProject
      ? 'Загрузите выбранный проект, чтобы получить задачи, роли и оценки из Azure DevOps.'
      : 'Выберите проект Azure DevOps выше.'
    : null;

  const plannedRolesSwitch = (disabled?: boolean) => <RoadmapToolbarSwitch
    label="С планом"
    icon={<ListChecks />}
    disabled={disabled}
    hint="Показывать только роли с положительным планом. В квартальном виде учитываются назначения выбранного квартала, а при их отсутствии — оценка Azure DevOps на всю карточку. В месячном виде — только часы выбранного месяца."
    checked={plannedRolesOnly}
    onChange={(checked) => tableSettings.change({ plannedRolesOnly: checked })}
  />;
  const switchGroupClass = 'inline-flex items-stretch divide-x divide-border rounded-md border border-border bg-card';
  // Both switches control the per-role columns, so they sit in one joined group.
  const roleColumnControls = <div role="group" aria-label="Столбцы по ролям" className={switchGroupClass}>
    <RoadmapToolbarSwitch
      label="По ролям"
      icon={<Users />}
      hint="Показать столбцы плана и факта по каждой роли проекта."
      checked={showRoleDetails}
      onChange={setRoleBreakdown}
    />
    {plannedRolesSwitch(!showRoleDetails)}
  </div>;
  const periodControls = <div role="group" aria-label="Период" className="flex h-8 items-center rounded-md border border-border bg-card shadow-xs">
    <Button type="button" variant="ghost" size="icon" className="h-full w-7 rounded-r-none" aria-label="Предыдущий квартал" onClick={() => shiftQuarter(-1)}><ChevronLeft aria-hidden="true" className="h-4 w-4" /></Button>
    <span aria-live="polite" className="min-w-16 text-center text-xs font-semibold tabular-nums">{currentQuarterLabel}</span>
    <Button type="button" variant="ghost" size="icon" className="h-full w-7 rounded-l-none" aria-label="Следующий квартал" onClick={() => shiftQuarter(1)}><ChevronRight aria-hidden="true" className="h-4 w-4" /></Button>
    {view === 'roles' ? <SearchableSelect
      ariaLabel="Период плана"
      value={selectedMonthKey}
      onChange={setSelectedMonthKey}
      searchable={false}
      options={[
        { value: '', label: 'Весь квартал' },
        ...currentQuarterMonths.map((month) => ({ value: month.monthKey, label: monthOptionLabel(month) })),
      ]}
      className="h-full min-h-0 w-auto max-w-full rounded-none rounded-r-md border-0 border-l border-border bg-transparent px-2.5 py-0 text-xs font-medium shadow-none hover:bg-muted/60"
    /> : null}
  </div>;

  return (
    <main className="roadmap-scrollbar relative min-h-0 flex-1 overflow-auto overscroll-none px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-full w-full flex-col gap-5">
          <h1 className="sr-only">План проекта</h1>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-6 gap-y-4">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <AzureProjectPicker
                projects={projects}
                includeAllProjects
                value={activeAzureProjectId}
                onChange={selectProject}
                disabled={catalogLoading || !projectSelectionReady}
                placeholder={plan?.name ?? (demoMode ? 'Демо-проект' : configured ? 'Выбрать проект Azure DevOps' : 'Выбрать локальный проект')}
              />
              {plan && !canEditPlan ? <span className="text-sm text-muted-foreground">Только просмотр</span> : null}
              {plan && createdTasks.length > 0 ? <CreatedTasksPanel items={createdTasks} /> : null}
              {canImportProject && <Button
                type="button"
                onClick={() => selectedProject && syncMutation.mutate(selectedProject)}
                disabled={syncMutation.isPending}
                className="gap-2"
              >
                {syncMutation.isPending ? <RefreshCw aria-hidden="true" className="h-4 w-4 motion-safe:animate-spin" /> : <ArrowDownToLine aria-hidden="true" className="h-4 w-4" />}
                {syncMutation.isPending ? 'Загружаем проект…' : 'Загрузить проект из Azure'}
              </Button>}
            </div>
          </div>
          {plan || isAllProjects ? <RoadmapSummaryStrip
            summary={isAllProjects ? overviewSummary : summary && view === 'periods' ? { ...summary, planHours: quarterTotalHours } : summary}
            month={Boolean(selectedMonth)}
            loading={isAllProjects ? overviewLoading : planQuery.isLoading}
            projects={isAllProjects && !overviewLoading ? overviewProjects.length : undefined}
          /> : null}

          {demoMode ? (
            <section role="status" className="rounded-xl border border-primary/20 bg-primary/[0.035] p-4 text-sm text-foreground">
              <p className="font-medium">Демо-роадмап на Vercel</p>
              <p className="mt-1 text-muted-foreground">Здесь можно менять назначения, роли и часы в демонстрационном проекте.</p>
            </section>
          ) : connectionQuery.data?.configured === false ? (
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
          {!demoMode && usingCachedProjects ? <div role="status" className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-sm text-amber-800 dark:text-amber-200">Azure DevOps временно недоступен. Показаны ранее импортированные проекты из локальной базы; планирование и демо-назначения доступны.</div> : null}
          <QueryErrorNotice
            title={mutationErrors.some(Boolean) ? 'Не удалось выполнить действие' : 'Не удалось загрузить данные проекта'}
            queries={loadQueries}
            errors={mutationErrors}
          />
          {!canConfigure && projectsQuery.isSuccess && !projects.length ? <p role="status" className="rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">У вас пока нет доступа к проектам.</p> : null}
          {syncResult ? (
            <div role="status" className="space-y-1 rounded-lg border border-border bg-card px-4 py-3 text-sm">
              <p>Задач из Azure DevOps: {syncResult.importedWorkItems}.{!syncResult.roleSyncWarning && syncResult.importedRoles !== undefined ? ` Ролей из Azure DevOps: ${syncResult.importedRoles}.` : null}</p>
              {syncResult.roleSyncWarning ? <p className="text-amber-800 dark:text-amber-200">{syncResult.roleSyncWarning}</p> : null}
            </div>
          ) : null}

          {isAllProjects ? <section {...appearanceProps} aria-label="Планы всех проектов" className={cn(appearanceProps.className, 'min-w-0 overflow-hidden rounded-xl border border-border bg-card')}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <h2 className="font-medium text-foreground">Все проекты</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">Импортированных проектов: {overviewProjects.length}. Раскройте проект, чтобы увидеть эпики и фичи.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">{appearanceSettings}{overviewData ? <Button type="button" variant="ghost" size="sm" className="h-8 gap-1.5" disabled={overviewQuery.isFetching || overviewFactQuery.isFetching} onClick={() => {
                void overviewQuery.refetch();
                void queryClient.refetchQueries({ queryKey: ['roadmap', 'plan'], type: 'active' });
                if (monthKey && !demoMode) {
                  void overviewFactQuery.refetch();
                  void queryClient.refetchQueries({ queryKey: ['roadmap', 'monthly-fact'], type: 'active' });
                }
              }}><RefreshCw aria-hidden="true" className="size-3.5" />Обновить</Button> : null}</div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
              <div className={switchGroupClass}>{plannedRolesSwitch()}</div>
              <div className="flex flex-wrap items-center gap-2">{periodControls}</div>
            </div>
            {overviewLoading ? <p role="status" className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
              Загружаем сводку проектов…
            </p> : null}
            {overviewData && !overviewSummary ? <p role="status" className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
              Данные части проектов недоступны. Обновите сводку.
            </p> : null}
            {monthKey && overviewProjects.length ? <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
              <p role="status">{demoMode ? 'Факт за месяц доступен в проектах Azure DevOps.' : overviewFactQuery.isPending ? 'Загружаем факт за месяц…' : overviewFactQuery.data?.factIncomplete ? 'Не удалось загрузить факт за месяц для части проектов.' : overviewFactQuery.isSuccess ? 'План и факт за выбранный месяц.' : null}</p>
              <QueryErrorNotice title="Не удалось загрузить факт за месяц" queries={[overviewFactQuery]} />
            </div> : null}
            {!projectsQuery.isLoading && !overviewProjects.length ? <div className="px-6 py-10 text-center text-sm text-muted-foreground">
              <p>Пока нет импортированных проектов.</p>
              <p className="mt-1">Выберите отдельный проект в списке, чтобы открыть или загрузить его план.</p>
            </div> : <AllProjectsPlanTable
              projects={overviewProjects}
              summaries={overviewData?.projects}
              loading={overviewLoading}
              onSelectProject={selectProject}
              quarterKey={currentQuarterKey}
              monthKey={monthKey}
              plannedRolesOnly={plannedRolesOnly}
              showFact={preferences.showFact}
              refreshInterval={demoMode ? false : PLAN_REFRESH_INTERVAL}
            />}
          </section> : plan ? (
            <>
              {focusMode ? <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" aria-hidden="true" /> : null}
              <section
                {...appearanceProps}
                role={focusMode ? 'dialog' : undefined}
                aria-modal={focusMode ? true : undefined}
                aria-label={focusMode ? 'Режим заполнения плана' : undefined}
                className={cn(appearanceProps.className, focusMode
                  ? 'fixed inset-3 z-50 flex h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl'
                  : 'flex flex-col overflow-hidden rounded-xl border border-border bg-card')}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <h2 className="truncate text-base font-medium leading-7 text-foreground">{plan.name}</h2>
                    <PlanSyncInfo
                      autoRefresh={!demoMode && configured && !usingCachedProjects && projectIsSynced}
                      syncedAt={plan.syncedAt}
                      writeBackMode={writeBackEnabled ? (plan.azure?.mode === 'manual' ? 'manual' : 'auto') : null}
                      errorCount={azureErrorCount}
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {appearanceSettings}
                    {canPushToAzure ? <Popover open={pushPreviewOpen} onOpenChange={setPushPreviewOpen}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant={plan.azure?.mode === 'manual' && azureUnsyncedCount ? 'default' : 'outline'} size="sm" className="h-8 gap-2" disabled={!azureUnsyncedCount} title="Посмотреть и отправить изменения плана в Azure DevOps">
                          <ArrowUpFromLine className="h-4 w-4" />
                          {azureUnsyncedCount ? `Отправить в Azure (${azureUnsyncedCount})` : 'Всё в Azure'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" side="bottom" sideOffset={8} collisionPadding={16} className="w-[min(560px,calc(100vw-2rem))] overflow-hidden rounded-xl p-0">
                        {pushPreviewOpen ? <AzurePushPreview projectId={roadmapProjectId} onDone={() => setPushPreviewOpen(false)} /> : null}
                      </PopoverContent>
                    </Popover> : null}
                    <Button type="button" variant={focusMode ? 'secondary' : 'outline'} size="sm" onClick={() => {
                      if (!focusMode && view === 'periods') setExpandedEpics(new Set(epics.map((epic) => epic.id)));
                      setFocusMode((current) => !current);
                    }} className="h-8 gap-2" aria-label={focusMode ? 'Выйти из режима фокуса' : 'Включить режим фокуса'}>
                      {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                      {focusMode ? 'Выйти' : 'Фокус'}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {PERIOD_PLANNING_ENABLED ? <>
                      <Button type="button" size="sm" variant={view === 'roles' ? 'secondary' : 'ghost'} onClick={() => setView('roles')} className="h-8 gap-1.5"><Users className="h-3.5 w-3.5" />По ролям</Button>
                      <Button type="button" size="sm" variant={view === 'periods' ? 'secondary' : 'ghost'} onClick={() => setView('periods')} className="h-8 gap-1.5"><Clock3 className="h-3.5 w-3.5" />По периодам</Button>
                    </> : null}
                    {view === 'roles' && roles.length > 0 && plan.workItems.length > 0 ? roleColumnControls : null}
                    {canConfigure ? <div role="group" aria-label="Роли проекта" className={switchGroupClass}>
                    <Popover open={rolePickerOpen} onOpenChange={setRolePickerOpen}>
                      <PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 rounded-none rounded-l-[5px] px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted/60 hover:text-foreground" aria-label="Добавить роль" title="Добавить роль из каталога" disabled={!roadmapProjectId || addRoleMutation.isPending}><Plus aria-hidden="true" className="size-3.5" />Роль</Button></PopoverTrigger>
                      <PopoverContent align="start" side="bottom" sideOffset={8} collisionPadding={16} className="w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-xl p-0">
                        <RoleCatalogPicker
                          templates={availableRoleTemplates}
                          catalogSize={(roleCatalogQuery.data ?? []).length}
                          loading={roleCatalogQuery.isLoading}
                          pendingId={addRoleMutation.isPending ? addRoleMutation.variables?.templateId ?? null : null}
                          onAdd={(templateId) => addRoleMutation.mutate({ projectId: roadmapProjectId, templateId })}
                        />
                      </PopoverContent>
                    </Popover>
                    <Link href={roleSettingsHref} className="inline-flex h-8 items-center gap-1.5 rounded-r-[5px] px-2.5 text-xs font-medium text-foreground hover:bg-muted/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"><Users aria-hidden="true" className="size-3.5" />Роли и участники</Link>
                    </div> : null}
                    {!demoMode && roadmapProjectId ? <AgentPanel
                      key={roadmapProjectId}
                      projectId={roadmapProjectId}
                      quarterKey={currentQuarterKey}
                      canEditPlan={canEditPlan}
                      onApplied={() => queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', roadmapProjectId] })}
                    /> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {view === 'periods' && focusMode ? <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setExpandedEpics(allEpicsExpanded ? new Set() : new Set(epics.map((epic) => epic.id)))}>{allEpicsExpanded ? 'Свернуть всё' : 'Развернуть всё'}</Button> : null}
                    {view === 'periods' ? <Button type="button" variant={showUnassignedPeriods ? 'secondary' : 'outline'} size="sm" className="h-8" onClick={() => setShowUnassignedPeriods((value) => !value)}>{showUnassignedPeriods ? 'Скрыть без назначений' : 'Показать без назначений'}</Button> : null}
                    {periodControls}
                  </div>
                </div>

                {selectedMonth ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 text-xs text-muted-foreground">
                  <p role="status">{demoMode ? 'Факт за месяц доступен в проектах Azure DevOps.' : monthlyFactQuery.isError ? (monthlyFact ? 'Не удалось обновить факт за месяц. Показаны последние загруженные данные.' : 'Не удалось загрузить факт за месяц.') : monthlyFactQuery.isFetching ? 'Загружаем факт за месяц…' : 'План по месяцам доступен для просмотра.'}</p>
                  {!demoMode && monthlyFactQuery.isError ? <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => void monthlyFactQuery.refetch()}>Повторить</Button> : null}
                </div> : null}

                {roles.length > 0 && needsPeopleSync && (configured || (canEditPlan && !selectedMonth)) ? (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                    <span>Чтобы назначать участников, синхронизируйте список пользователей Azure DevOps.</span>
                    <Link href={routes.roadmapAdminUsers} className="rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Перейти к синхронизации</Link>
                  </div>
                ) : null}

                {!epics.length && !features.length ? (
                  <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                    <p>В проекте пока нет эпиков или фич.{canImportProject ? ' Загрузите проект из Azure DevOps.' : ''}</p>
                    {canCreateWorkItem ? <Button ref={createEpicTrigger} type="button" variant="outline" size="sm" className="mt-4" aria-haspopup="dialog" onClick={(event) => openCreateWorkItem(event.currentTarget)}><Plus aria-hidden="true" className="size-4" />Создать эпик</Button> : null}
                  </div>
                ) : (
                  <div className={focusMode ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : undefined}>
                    {!roles.length ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">Эпики и связанные фичи загружены</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">Добавьте роли и закрепите за ними сотрудников, чтобы распределять часы по фичам.</p>
                        </div>
                        {canConfigure ? <Link href={roleSettingsHref} className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground hover:bg-muted"><Users aria-hidden="true" className="h-4 w-4" />Настроить роли</Link> : null}
                      </div>
                    ) : null}
                    {view === 'roles' && showRoleDetails && plannedRolesOnly && roles.length > 0 && visibleRoles.length === 0 ? (
                      <p id="roadmap-plan-roles" role="status" className="border-b border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                        В выбранном периоде нет оценок по ролям. Выключите фильтр «С планом», чтобы увидеть все роли.
                      </p>
                    ) : null}
                    {view === 'periods' ? <QuarterPlanningGrid
                      key={user?.id ?? 'anonymous'}
                      epics={epics}
                      features={features}
                      months={currentQuarterMonths}
                      roles={roles}
                      roleSettingsHref={canConfigure ? roleSettingsHref : undefined}
                      canEditPlan={canEditPlan}
                      saving={saveQuarterMutation.isPending || saveMutation.isPending}
                      focusMode={focusMode}
                      columnWidths={columnWidths}
                      showUnassigned={showUnassignedPeriods}
                      expandedEpics={expandedEpics}
                      onToggleEpic={(epicId) => setExpandedEpics((current) => {
                        const next = new Set(current);
                        if (next.has(epicId)) next.delete(epicId);
                        else next.add(epicId);
                        return next;
                      })}
                      onSaveQuarter={saveQuarter}
                      onAddAssignment={saveAllocation}
                    /> : <div
                      role="region"
                      aria-label="Таблица плана и факта по ролям"
                      tabIndex={0}
                      className={cn('@container roadmap-scrollbar min-w-0 overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring', focusMode ? 'min-h-0 flex-1' : 'max-h-[calc(100dvh-7rem)]')}
                    >
                      <ResizablePlanTable
                        key={JSON.stringify([user?.id, roadmapProjectId])}
                        columns={tableColumns}
                        onColumnResize={(id, width) => columnWidths.commitWidth(id, width, tableColumns.find((column) => column.id === id)!)}
                        className="roadmap-plan-table table-fixed border-separate border-spacing-0 text-left [&>thead>tr>th]:border-b [&>thead>tr>th]:border-b-inherit [&>tbody>tr+tr>*]:border-t [&>tbody>tr+tr>*]:border-t-inherit [&>tfoot>tr>*]:border-t-2 [&>tfoot>tr>*]:border-t-inherit"
                      >
                      <thead className="sticky top-0 z-20 bg-card [&_th]:isolate">
                        <tr className="border-b border-border bg-[color-mix(in_srgb,var(--color-muted)_40%,var(--color-card))] text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <th scope="col" data-column-id="name" rowSpan={headerRowSpan} style={pinnedCellStyle('name')} className={cn('relative px-3 py-2.5 pr-5 @lg:px-4 @lg:pr-5', pinnedCellClass('name'))}><div className="flex items-center justify-between gap-1 @lg:gap-3"><span>Эпик / фича</span>{canCreateWorkItem ? <Button ref={createEpicTrigger} type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Создать эпик" title="Создать эпик" aria-haspopup="dialog" onClick={(event) => openCreateWorkItem(event.currentTarget)}><Plus aria-hidden="true" className="size-4" /></Button> : null}</div><ColumnResizeHandle columnId="name" /></th>
                          <th scope="col" data-column-id="summary:plan" rowSpan={headerRowSpan} style={pinnedCellStyle('summary:plan')} className={cn('relative border-l border-border/60 px-3 py-2.5 text-right', pinnedCellClass('summary:plan'))} title={selectedMonth ? 'План выбранного месяца' : 'Назначения выбранного квартала. При их отсутствии используется общая оценка Azure на карточке, без привязки к кварталу.'}>
                            <span className="block">План</span><span className="text-[10px] font-normal normal-case">итого, ч</span>
                            <ColumnResizeHandle columnId="summary:plan" />
                          </th>
                          {preferences.showFact ? <th scope="col" data-column-id="summary:fact" rowSpan={headerRowSpan} style={pinnedCellStyle('summary:fact')} className={cn('relative px-3 py-2.5 text-right', pinnedCellClass('summary:fact'))} title={selectedMonth ? 'Изменение Completed Work за выбранный календарный месяц (UTC)' : 'Суммарный факт за всё время'}>
                            <span className="block">Факт</span><span className="text-[10px] font-normal normal-case">{selectedMonth ? 'за месяц, ч' : 'всего, ч'}</span>
                            <ColumnResizeHandle columnId="summary:fact" />
                          </th> : null}
                          {detailRoles.map((role) => {
                            const hasActiveMembers = (role.members ?? []).some((member) => member.personIsActive);
                            return <th scope="colgroup" colSpan={roleMetricCount} key={role.id} className="border-l border-border/60 px-3 py-2">
                              <div className="flex min-w-0 items-center gap-2 normal-case tracking-normal">
                                <RoleMark name={role.name} color={role.color} size="sm" />
                                <span className="min-w-0 truncate text-[13px] font-semibold text-foreground" title={role.name}>{role.name}</span>
                                {role.azureEstimateField ? <span role="img" aria-label="Оценка роли берётся из Azure DevOps" className="shrink-0 text-muted-foreground" title="Оценка роли берётся из Azure DevOps"><Cloud aria-hidden="true" className="size-3.5" /></span> : null}
                                {role.isMock && !/демо/i.test(role.name) ? <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-700 dark:text-amber-300">демо</span> : null}
                                <span className="ml-auto flex shrink-0 items-center">
                                {!selectedMonth && role.members?.length ? <Popover>
                                  <PopoverTrigger asChild><button type="button" aria-label={`Участники роли «${role.name}»: ${role.members.length}`} title="Участники роли" className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-xs font-medium tabular-nums text-muted-foreground transition-colors hover:bg-card hover:text-foreground"><Users aria-hidden="true" className="size-3.5 shrink-0" />{role.members.length}</button></PopoverTrigger>
                                  <PopoverContent align="start" side="bottom" sideOffset={6} collisionPadding={16} className="w-[min(320px,calc(100vw-2rem))] rounded-xl p-2">
                                    <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Участие в роли · {role.name}</p>
                                    <ul className="max-h-64 overflow-y-auto">
                                      {role.members.map((member) => <li key={member.personExternalId} className="flex items-center gap-2 px-2 py-2 text-sm">
                                        <span className="min-w-0 flex-1"><span className="block truncate">{member.personName}</span><span className="block truncate text-xs text-muted-foreground">{member.personIsActive ? member.personEmail : 'Неактивен'}</span></span>
                                        <span className="shrink-0 font-medium tabular-nums">{memberParticipation(role, member.personExternalId).toLocaleString('ru-RU')}%</span>
                                      </li>)}
                                    </ul>
                                    {canConfigure ? <Link href={roleSettingsHref} className="mt-1 block rounded-lg border-t border-border px-2 py-2 text-sm text-primary hover:bg-muted">Настроить состав и участие</Link> : null}
                                  </PopoverContent>
                                </Popover> : null}
                                {!hasActiveMembers && canConfigure ? <Link href={roleSettingsHref} aria-label={`Добавить участников в роль «${role.name}»`} title="Добавить участников" className="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-card hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"><UserRoundPlus aria-hidden="true" className="size-4" /></Link> : null}
                                {!hasActiveMembers && !canConfigure ? <span className="text-xs font-normal text-muted-foreground">Нет участников</span> : null}
                                </span>
                              </div>
                            </th>;
                          })}
                          {showUnattributedFact ? <th scope="col" rowSpan={2} data-column-id="fact:unattributed" title="Факт участников, для которых не определена единственная роль в проекте" className="relative border-l border-border/60 px-3 py-2.5 text-right">Без роли<span className="block text-[10px] font-normal normal-case">факт, ч</span><ColumnResizeHandle columnId="fact:unattributed" /></th> : null}
                        </tr>
                        {headerRowSpan === 2 ? <tr className="border-b border-border bg-muted/20 text-right text-[11px] font-medium text-muted-foreground">
                          {detailRoles.map((role) => <Fragment key={role.id}>
                            <th scope="col" data-column-id={`plan:${role.id}`} className="relative border-l border-border/60 px-3 py-1.5">План, ч<ColumnResizeHandle columnId={`plan:${role.id}`} /></th>
                            {preferences.showFact ? <th scope="col" data-column-id={`fact:${role.id}`} className="relative border-l border-border/40 px-3 py-1.5">Факт, ч<ColumnResizeHandle columnId={`fact:${role.id}`} /></th> : null}
                            {preferences.showDelta ? <th scope="col" data-column-id={`delta:${role.id}`} title="Дельта: факт − план, ч" className="relative border-l border-border/40 px-3 py-1.5">Δ, ч<ColumnResizeHandle columnId={`delta:${role.id}`} /></th> : null}
                          </Fragment>)}
                        </tr> : null}
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
                            {!collapsed ? children.map((feature, index) => renderItemRow(feature, false, 0, false, undefined, true, index === children.length - 1)) : null}
                          </Fragment>;
                        })}
                        {standaloneFeatures.map((feature) => renderItemRow(feature))}
                        {unattachedPlanHours > 0 ? <tr className="border-t border-border/50 bg-card text-sm">
                          <th scope="row" style={pinnedCellStyle('name')} className={cn('px-4 py-3 text-left font-normal', pinnedCellClass('name'))}>
                            План без эпика / фичи<span className="mt-0.5 block text-xs text-muted-foreground">Назначения на карточках без связи с эпиком или фичей</span>
                          </th>
                          <td style={pinnedCellStyle('summary:plan')} className={cn('px-3 py-3 text-right tabular-nums', pinnedCellClass('summary:plan'))}>{cellHours(unattachedPlanHours)}</td>
                          {preferences.showFact ? <td style={pinnedCellStyle('summary:fact')} className={cn('px-3 py-3 text-right text-muted-foreground', pinnedCellClass('summary:fact'))}>—</td> : null}
                          {detailRoles.map((role) => <Fragment key={role.id}>
                            <td className="border-l border-border/60 px-3 py-3 text-right tabular-nums">{cellHours(rolePlan.byUnattached.get(role.id) ?? 0)}</td>
                            {renderRoleMetrics(role.id, rolePlan.byUnattached.get(role.id) ?? 0, null)}
                          </Fragment>)}
                          {showUnattributedFact ? renderFactCell(null, 'unattributed') : null}
                        </tr> : null}
                      </tbody>
                      <tfoot className="sticky bottom-0 z-20 bg-card">
                        <tr className="border-t-2 border-border bg-[color-mix(in_srgb,var(--color-muted)_40%,var(--color-card))] text-sm font-semibold text-foreground">
                          <th scope="row" style={pinnedCellStyle('name')} className={cn('px-3 py-3 @lg:px-4', pinnedCellClass('name'))}>Итого по проекту</th>
                          <td style={pinnedCellStyle('summary:plan')} className={cn('whitespace-nowrap border-l border-border/60 px-3 py-3 text-right tabular-nums', pinnedCellClass('summary:plan'))}>{cellHours(totalHours)}</td>
                          {preferences.showFact ? <td style={pinnedCellStyle('summary:fact')} className={cn('whitespace-nowrap px-3 py-3 text-right tabular-nums', pinnedCellClass('summary:fact'), totalActualHours ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground')}>{cellHours(totalActualHours)}</td> : null}
                          {detailRoles.map((role) => {
                            const hours = rolePlan.byProject.get(role.id) ?? 0;
                            return <Fragment key={role.id}>
                              <td className={cn('border-l border-border/60 px-3 py-3 text-right tabular-nums', !hours && 'text-muted-foreground')}>{cellHours(hours)}</td>
                              {renderRoleMetrics(role.id, hours, totalActualHours === null ? null : projectRoleFact.get(role.id) ?? 0)}
                            </Fragment>;
                          })}
                          {showUnattributedFact ? renderFactCell(totalActualHours === null ? null : projectUnattributedFact, 'unattributed') : null}
                        </tr>
                      </tfoot>
                    </ResizablePlanTable></div>}
                  </div>
                )}
                {createTarget && createProject && createTarget.externalProjectId === createProject.id && plan.externalId === createProject.id ? <CreateAzureWorkItem
                  key={JSON.stringify([createProject.id, createTarget.type, createTarget.parentExternalId])}
                  externalProjectId={createProject.id}
                  projectName={createProject.name}
                  items={plan.workItems}
                  people={people}
                  initialType={createTarget.type}
                  parentExternalId={createTarget.parentExternalId}
                  onCreated={(item, parentExternalId) => {
                    if (item.type !== 'Feature' || !parentExternalId) return;
                    const parent = epics.find((epic) => epic.externalId === parentExternalId);
                    if (parent) setExpandedEpics((current) => new Set(current).add(parent.id));
                  }}
                  onClose={() => {
                    setCreateTarget(null);
                    (createTarget.trigger.isConnected ? createTarget.trigger : createEpicTrigger.current)?.focus();
                  }}
                /> : null}
              </section>
            </>
          ) : loadingMessage ? (
            <PlanTableSkeleton label={loadingMessage} />
          ) : emptyPlanMessage ? (
            <div className="rounded-xl border border-border bg-card px-6 py-12 text-center">
              <ArrowDownToLine aria-hidden="true" className="mx-auto h-7 w-7 text-muted-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">{emptyPlanMessage}</p>
            </div>
          ) : null}
        </div>
    </main>
  );
}

function PlanSyncInfo({ autoRefresh, syncedAt, writeBackMode, errorCount }: {
  autoRefresh: boolean;
  syncedAt?: string | null;
  writeBackMode: 'auto' | 'manual' | null;
  errorCount: number;
}) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | null>(null);
  const hasErrors = writeBackMode !== null && errorCount > 0;
  const show = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    setOpen(true);
  };
  const hide = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };
  useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);
  const Icon = hasErrors ? AlertCircle : Clock3;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={hasErrors ? `Синхронизация с Azure: ошибок ${errorCount}` : 'Информация о синхронизации'}
          onPointerEnter={(event) => { if (event.pointerType === 'mouse') show(); }}
          onPointerLeave={(event) => { if (event.pointerType === 'mouse') hide(); }}
          className={cn(
            'inline-flex h-7 min-w-7 shrink-0 items-center justify-center gap-1 rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:bg-muted data-[state=open]:text-foreground',
            hasErrors && 'bg-destructive/10 px-2 text-destructive hover:bg-destructive/15 hover:text-destructive data-[state=open]:bg-destructive/15 data-[state=open]:text-destructive',
          )}
        >
          <Icon aria-hidden="true" className="h-4 w-4" strokeWidth={1.75} />
          {hasErrors ? <span className="text-xs font-medium tabular-nums">{errorCount}</span> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        sideOffset={6}
        collisionPadding={16}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onPointerEnter={show}
        onPointerLeave={hide}
        className="w-auto max-w-xs px-3 py-2 text-xs"
      >
        <dl className="grid grid-cols-[auto_auto] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Последний импорт</dt>
          <dd className="text-foreground">
            {syncedAt
              ? <time dateTime={syncedAt}>{new Date(syncedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</time>
              : 'ещё не было'}
          </dd>
          {autoRefresh ? <>
            <dt className="text-muted-foreground">Автообновление</dt>
            <dd className="text-foreground">каждые 5 мин</dd>
          </> : null}
          {writeBackMode ? <>
            <dt className="text-muted-foreground">Запись в Azure</dt>
            <dd className="text-foreground">{writeBackMode === 'manual' ? 'по кнопке' : 'автоматически'}</dd>
          </> : null}
          {hasErrors ? <>
            <dt className="text-muted-foreground">Ошибки записи</dt>
            <dd className="font-medium text-destructive">{errorCount}</dd>
          </> : null}
        </dl>
      </PopoverContent>
    </Popover>
  );
}
