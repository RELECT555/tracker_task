'use client';

import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { AlertCircle, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Check, ChevronDown, ChevronLeft, ChevronRight, Clock3, Equal, ExternalLink, Eye, EyeOff, Maximize2, Minus, Minimize2, Pencil, Plus, RefreshCw, Users, X } from 'lucide-react';
import { useAuth } from '@/features/auth/model/useAuth';
import { isAdminUser } from '@/features/auth/lib/is-admin';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { RoadmapTopbar } from '@/widgets/roadmap-shell/RoadmapFrame';
import { AzureProjectPicker } from '@/entities/roadmap/ui/AzureProjectPicker';
import { AzurePushPreview } from '@/entities/roadmap/ui/AzurePushPreview';
import { AzureWorkItemIcon } from '@/entities/roadmap/ui/AzureWorkItemIcon';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { ColorMark, RoleMark } from '@/shared/ui/color-mark';
import {
  getRoadmapMonthlyFact,
  roadmapApi,
  type AzureProject,
  type RoadmapAllocation,
  type RoadmapMonthlyFact,
  type RoadmapPeriod,
  type RoadmapProjectsResult,
  type RoadmapRole,
  type RoadmapWorkItem,
} from '@/entities/roadmap/api/roadmapApi';
import { isRoadmapDemoMode } from '@/entities/roadmap/api/roadmapDemo';
import { getRoadmapRoleFact } from '../model/roadmap-role-fact';
import { CreateAzureWorkItem } from './CreateAzureWorkItem';

const NAME_COLUMN_STORAGE_KEY = 'roadmap-name-column-width';
const NAME_COLUMN_MIN_WIDTH = 280;
const NAME_COLUMN_MAX_WIDTH = 900;
const DEFAULT_NAME_COLUMN_WIDTH = 440;
const PLAN_REFRESH_INTERVAL = 60_000;
const FEATURE_COUNT_PLURALS = new Intl.PluralRules('ru-RU');
// Monthly (period) planning is temporarily disabled; stored month values are kept untouched.
const PERIOD_PLANNING_ENABLED = false;

type AllocationInput = Omit<Parameters<typeof roadmapApi.saveAllocation>[0], 'quarterKey'>;

function NameColumnResizeHandle({ width, onChange }: { width: number; onChange: (width: number) => void }) {
  const dragStart = useRef<{ x: number; width: number } | null>(null);
  const resize = (value: number) => onChange(Math.min(NAME_COLUMN_MAX_WIDTH, Math.max(NAME_COLUMN_MIN_WIDTH, value)));

  return <div
    role="separator"
    aria-orientation="vertical"
    aria-label="Изменить ширину столбца с названиями"
    aria-valuemin={NAME_COLUMN_MIN_WIDTH}
    aria-valuemax={NAME_COLUMN_MAX_WIDTH}
    aria-valuenow={width}
    aria-valuetext={`${width} пикселей`}
    tabIndex={0}
    title="Перетащите, чтобы изменить ширину"
    onPointerDown={(event) => {
      event.preventDefault();
      dragStart.current = { x: event.clientX, width };
      event.currentTarget.setPointerCapture(event.pointerId);
    }}
    onPointerMove={(event) => {
      if (dragStart.current) resize(dragStart.current.width + event.clientX - dragStart.current.x);
    }}
    onPointerUp={() => { dragStart.current = null; }}
    onPointerCancel={() => { dragStart.current = null; }}
    onKeyDown={(event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      resize(width + (event.key === 'ArrowRight' ? 16 : -16));
    }}
    className="group absolute inset-y-0 right-0 z-30 flex w-3 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-px after:bg-border after:content-[''] hover:after:w-0.5 hover:after:bg-primary focus-visible:after:w-0.5 focus-visible:after:bg-primary"
  >
    <span className="relative z-10 h-8 w-1 rounded-full bg-border transition-colors group-hover:bg-primary group-focus-visible:bg-primary" />
  </div>;
}
/** Allocations that still have to reach Azure DevOps (never sent, waiting, or failed). */
function needsAzurePush(allocation: RoadmapAllocation) {
  return allocation.azureSyncStatus !== 'synced' && allocation.azureSyncStatus !== 'skipped';
}

function azureRoleEstimate(item: RoadmapWorkItem, role: RoadmapRole) {
  const value = role.azureEstimateField ? item.azureCustomFields?.[role.azureEstimateField] : undefined;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
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

function monthOptionLabel(month: QuarterMonth) {
  return `${month.label.charAt(0).toUpperCase()}${month.label.slice(1)} · ${month.monthKey.slice(2)}`;
}

function monthlyPlan(item: RoadmapWorkItem, monthKey: string, fact?: RoadmapMonthlyFact): RoadmapWorkItem {
  return {
    ...item,
    actualHours: fact ? fact.workItems[item.id] ?? 0 : null,
    allocations: item.allocations.flatMap((allocation) => {
      // Legacy allocations can contain periods outside the allocation's planning quarter.
      const periods = allocation.periods.filter((period) => period.monthKey === monthKey);
      const actualHours = fact?.allocations[allocation.id] ?? null;
      if (!periods.length && !actualHours) return [];
      return [{
        ...allocation,
        periods,
        estimatedHours: periods.reduce((hours, period) => hours + Number(period.hours), 0),
        actualHours,
      }];
    }),
  };
}

const hoursFormat = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2, useGrouping: false });

function displayHours(hours: number | string | null) {
  return hours === null ? '—' : `${hoursFormat.format(Number(hours))} ч`;
}

function unattributedFact(total: number, byRole?: Map<string, number>) {
  let attributed = 0;
  for (const hours of byRole?.values() ?? []) attributed += hours;
  return Number((total - attributed).toFixed(2));
}

function BreakdownHeading({ label, kind, expanded, onToggle }: {
  label: string;
  kind: 'plan' | 'fact';
  expanded: boolean;
  onToggle?: () => void;
}) {
  return onToggle ? (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-auto min-h-8 max-w-full gap-1 whitespace-normal px-1.5 py-1 text-right text-[11px] font-semibold uppercase leading-tight tracking-wide"
      aria-label={`${label} по ролям`}
      aria-expanded={expanded}
      aria-controls={expanded ? `roadmap-${kind}-roles` : undefined}
      onClick={onToggle}
    >
      {label}
      {expanded ? <Minus aria-hidden="true" className="size-3.5 shrink-0" /> : <Plus aria-hidden="true" className="size-3.5 shrink-0" />}
    </Button>
  ) : label;
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
  saving,
  focusMode,
  nameColumnWidth,
  onNameColumnWidthChange,
  showUnassigned,
  expandedEpics,
  onToggleEpic,
  onSaveQuarter,
  onAddAssignment,
  showEpicAssignments,
}: {
  epics: RoadmapWorkItem[];
  features: RoadmapWorkItem[];
  months: QuarterMonth[];
  roles: RoadmapRole[];
  roleSettingsHref?: string;
  saving: boolean;
  focusMode: boolean;
  nameColumnWidth: number;
  onNameColumnWidthChange: (width: number) => void;
  showUnassigned: boolean;
  expandedEpics: Set<string>;
  onToggleEpic: (epicId: string) => void;
  onSaveQuarter: (allocation: RoadmapAllocation, values: { monthKey: string; hours: number }[]) => Promise<boolean>;
  onAddAssignment: (data: AllocationInput) => void;
  showEpicAssignments: boolean;
}) {
  const monthHours = (allocations: RoadmapAllocation[], monthKey: string) => allocations.reduce((sum, allocation) =>
    sum + allocation.periods.reduce((inner, period) => inner + (period.monthKey === monthKey ? Number(period.hours) : 0), 0), 0);
  const plannedHours = (allocation: RoadmapAllocation) => allocation.periods.reduce((sum, period) => sum + Number(period.hours), 0);
  const quarterHours = (allocations: RoadmapAllocation[]) => months.reduce((sum, month) => sum + monthHours(allocations, month.monthKey), 0);
  const assignments = [...epics.flatMap((epic) => epic.allocations), ...features.flatMap((feature) => feature.allocations)];
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
          {!epic || showEpicAssignments ? <QuarterAssignmentButton item={item} roles={roles} saving={saving} roleSettingsHref={roleSettingsHref} onSave={onAddAssignment} /> : null}
        </div>
      </th>
      {months.map((month) => <td key={month.monthKey} className="border-b border-border/50 px-3 py-2.5 text-right text-sm tabular-nums text-foreground/80">{monthHours(itemAllocations, month.monthKey) || <span className="text-muted-foreground">—</span>}</td>)}
      <td className="border-b border-l border-primary/15 bg-primary/[0.055] px-3 py-2.5 text-right text-sm font-semibold tabular-nums text-foreground">{quarterHours(itemAllocations) || <span className="text-muted-foreground">—</span>}</td>
      <td className="border-b border-border/50 px-4 py-2.5 text-right text-sm tabular-nums text-muted-foreground">{itemAllocations.reduce((sum, allocation) => sum + Number(allocation.estimatedHours) - plannedHours(allocation), 0) || '—'}</td>
    </tr>
  );

  const renderAssignment = (item: RoadmapWorkItem, allocation: RoadmapAllocation, directEpic = false, isLastChild = false) => {
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

    return <tr key={`allocation-${allocation.id}`} className={`group border-b border-border/50 transition-colors hover:bg-primary/[0.035] ${directEpic ? 'bg-primary/[0.025]' : 'bg-card'}`}>
      <th scope="row" className={`sticky left-0 z-[2] min-w-72 border-r border-border/80 px-4 py-2 text-left font-normal group-hover:bg-muted/30 ${directEpic ? 'bg-primary/[0.05]' : 'bg-card'}`}>
        <div className={`relative flex min-w-0 items-center gap-2 ${directEpic ? 'pl-12 before:left-0 after:left-0' : 'pl-16 before:left-4 after:left-4'} before:absolute before:top-[-8px] before:border-l-2 before:border-border/70 after:absolute after:top-3 after:w-5 after:border-t-2 after:border-border/70 ${isLastChild ? 'before:h-5' : 'before:bottom-[-8px]'}`}>
          <ColorMark color={allocation.role.color} size="sm" />
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
      <td className="whitespace-nowrap border-b border-l border-primary/15 bg-primary/[0.055] px-3 py-2 text-right text-sm font-semibold tabular-nums text-foreground">{monthsPlanned || <span className="text-muted-foreground">—</span>}{monthsPlanned ? ' ч' : null}</td>
      <td className={`whitespace-nowrap border-b border-border/50 px-4 py-2 text-right text-xs tabular-nums ${remaining < 0 ? 'font-medium text-destructive' : 'text-muted-foreground'}`}>{remaining < 0 ? `Перепланировано ${Math.abs(remaining)} ч` : `${remaining} ч`}</td>
    </tr>;
  };

  const renderFeature = (feature: RoadmapWorkItem, isLastChild = false) => <Fragment key={`feature-${feature.id}`}>
    {renderSummary(feature, feature.allocations, false, isLastChild)}
    {feature.allocations.map((allocation, index) => renderAssignment(feature, allocation, false, index === feature.allocations.length - 1))}
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
      <table onPaste={handlePaste} className="w-full min-w-[1040px] table-fixed border-collapse text-left">
        <colgroup>
          <col style={{ width: `${nameColumnWidth}px` }} />
          <col style={{ width: '140px' }} />
          <col style={{ width: '140px' }} />
          <col style={{ width: '140px' }} />
          <col style={{ width: '150px' }} />
          <col style={{ width: '170px' }} />
        </colgroup>
        <thead className="sticky top-0 z-[3] bg-card/95 backdrop-blur">
          <tr className="border-b border-border text-xs font-semibold text-muted-foreground">
            <th scope="col" className="sticky left-0 top-0 z-20 min-w-72 border-r border-border/80 bg-muted/90 px-4 py-3 pr-5"><span>Задача / назначение</span><NameColumnResizeHandle width={nameColumnWidth} onChange={onNameColumnWidthChange} /></th>
            {months.map((month) => <th key={month.monthKey} scope="col" className="min-w-28 px-3 py-3 text-right"><span className="block capitalize text-foreground">{month.label}</span><span className="text-[10px] font-normal">план, ч</span></th>)}
            <th scope="col" className="min-w-24 border-l border-primary/15 bg-primary/[0.07] px-3 py-3 text-right"><span className="block text-foreground">Квартал</span><span className="text-[10px] font-normal">итого, ч</span></th>
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
                {showEpicAssignments ? epic.allocations.map((allocation, index) => renderAssignment(epic, allocation, true, index === epic.allocations.length - 1)) : null}
                {visibleChildren.map((feature, index) => renderFeature(feature, index === visibleChildren.length - 1))}
              </> : null}
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
  defaultPersonExternalId?: string | null;
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
    setPersonId(initial?.personExternalId ?? defaultPersonExternalId ?? '');
    setHours(initial ? String(initial.estimatedHours) : '');
  };

  return (
    <Popover open={open} onOpenChange={(nextOpen) => { if (nextOpen) startEditing(); setOpen(nextOpen); }}>
      <PopoverTrigger asChild>
        {trigger ?? <Button type="button" variant={initial ? 'ghost' : 'outline'} size="sm" className={triggerClassName ?? (initial ? 'mt-1 h-7 gap-1 px-2 text-xs text-muted-foreground' : 'mt-2 h-8 gap-1.5 px-2.5 text-xs')} aria-label={initial ? `Изменить оценку: ${selectedPerson?.name ?? initial.personExternalId}` : triggerLabel ?? 'Назначить участника'}>
          {initial ? <Pencil className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          {initial ? 'Изменить назначение' : triggerLabel ?? (defaultPersonExternalId ? 'Задать оценку' : 'Добавить участника')}
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
  const [selectedAzureProjectId, setSelectedAzureProjectId] = useState('');
  const [view, setView] = useState<'roles' | 'periods'>('roles');
  const [focusMode, setFocusMode] = useState(false);
  const [nameColumnWidth, setNameColumnWidth] = useState(DEFAULT_NAME_COLUMN_WIDTH);
  const [nameColumnWidthReady, setNameColumnWidthReady] = useState(false);
  const [showUnassignedPeriods, setShowUnassignedPeriods] = useState(false);
  const [showEpicAssignments, setShowEpicAssignments] = useState(false);
  const [roleBreakdowns, setRoleBreakdowns] = useState<Partial<Record<string, { plan?: boolean; fact?: boolean }>>>({});
  const [plannedRolesOnlyByProject, setPlannedRolesOnlyByProject] = useState<Partial<Record<string, boolean>>>({});
  const [quarterSelection, setQuarterSelection] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
  });
  const [selectedMonthKey, setSelectedMonthKey] = useState('');
  const [expandedEpics, setExpandedEpics] = useState<Set<string>>(() => new Set());
  const [rolePickerOpen, setRolePickerOpen] = useState(false);
  const [defaultRolePickerId, setDefaultRolePickerId] = useState<string | null>(null);

  useEffect(() => {
    const savedWidth = Number(window.localStorage.getItem(NAME_COLUMN_STORAGE_KEY));
    if (Number.isFinite(savedWidth) && savedWidth >= NAME_COLUMN_MIN_WIDTH && savedWidth <= NAME_COLUMN_MAX_WIDTH) {
      setNameColumnWidth(savedWidth);
    }
    setNameColumnWidthReady(true);
  }, []);

  useEffect(() => {
    if (nameColumnWidthReady) window.localStorage.setItem(NAME_COLUMN_STORAGE_KEY, String(nameColumnWidth));
  }, [nameColumnWidth, nameColumnWidthReady]);

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

  const connectionQuery = useQuery({ queryKey: ['roadmap', 'connection'], queryFn: roadmapApi.connection });
  const configured = connectionQuery.data?.configured ?? false;
  const projectsQuery = useQuery({ queryKey: ['roadmap', 'azure-projects'], queryFn: roadmapApi.projects });
  const peopleQuery = useQuery({ queryKey: ['roadmap', 'people'], queryFn: roadmapApi.people });
  const roleCatalogQuery = useQuery({ queryKey: ['roadmap', 'admin', 'role-catalog'], queryFn: roadmapApi.roleCatalog, enabled: canConfigure });
  const projects = useMemo(() => projectsQuery.data?.data ?? [], [projectsQuery.data?.data]);
  const people = peopleQuery.data?.data ?? [];
  const usingCachedProjects = projectsQuery.data?.source === 'cache';
  const selectedProject = projects.find((project) => project.id === selectedAzureProjectId)
    ?? projects.find((project) => project.imported && project.planSynced !== false)
    ?? projects.find((project) => project.imported)
    ?? projects[0];
  const activeAzureProjectId = selectedProject?.id ?? '';
  const roadmapProjectId = selectedProject?.roadmapId ?? '';
  const {
    plan: showPlanRoles = true,
    fact: showFactRoles = false,
  } = roleBreakdowns[roadmapProjectId] ?? {};
  const setRoleBreakdown = (kind: 'plan' | 'fact', expanded: boolean, projectId = roadmapProjectId) => {
    setRoleBreakdowns((current) => ({ ...current, [projectId]: { ...current[projectId], [kind]: expanded } }));
  };
  const projectIsSynced = Boolean(selectedProject?.imported && selectedProject.planSynced !== false);
  const canImportProject = Boolean(!demoMode && configured && selectedProject && !usingCachedProjects && !projectIsSynced);
  const roleSettingsHref = roadmapProjectId ? `${routes.roadmapAdminRoles}?projectId=${encodeURIComponent(roadmapProjectId)}` : routes.roadmapAdminRoles;

  useEffect(() => {
    if (activeAzureProjectId) setSelectedAzureProjectId(activeAzureProjectId);
  }, [activeAzureProjectId]);

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
  const plan = planQuery.data;
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
  const createProject = canConfigure && configured && !demoMode && projectsQuery.data?.source === 'azure' ? selectedProject : undefined;
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
  const plannedRolesOnly = plannedRolesOnlyByProject[roadmapProjectId] ?? true;
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
      setPlannedRolesOnlyByProject((current) => ({ ...current, [projectId]: false }));
      setRoleBreakdown('plan', true, projectId);
      await queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', projectId] });
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
    mutationFn: roadmapApi.rebalanceAllocations,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan', roadmapProjectId] }),
  });
  const monthKey = selectedMonth?.monthKey;
  const plannedItems = useMemo(() => plan?.workItems.map((item) => monthKey
    ? monthlyPlan(item, monthKey, monthlyFact)
    : { ...item, allocations: item.allocations.filter((allocation) => allocation.quarterKey === currentQuarterKey) }
  ) ?? [], [plan, monthKey, monthlyFact, currentQuarterKey]);
  const epics = useMemo(() => plannedItems.filter((item) => item.type.toLowerCase() === 'epic'), [plannedItems]);
  const features = useMemo(() => plannedItems.filter((item) => item.type.toLowerCase() === 'feature'), [plannedItems]);
  const standaloneFeatures = features.filter((feature) => !epics.some((epic) => epic.externalId === feature.parentExternalId));
  const visibleRoles = useMemo(() => {
    if (!plan) return [];
    if (!plannedRolesOnly) return plan.roles;
    const planItems = [...epics, ...features];
    const plannedRoleIds = new Set(planItems.flatMap((item) => item.allocations)
      .filter((allocation) => Number(allocation.estimatedHours) > 0)
      .map((allocation) => allocation.roleId));
    return plan.roles.filter((role) => plannedRoleIds.has(role.id)
      || (role.azureEstimateField && planItems.some((item) => (azureRoleEstimate(item, role) ?? 0) > 0)));
  }, [plan, plannedRolesOnly, epics, features]);
  const displayedAllocations = (selectedMonth ? [...epics, ...features] : plannedItems).flatMap((item) => item.allocations);
  const assignedPeopleCount = new Set([
    ...displayedAllocations.filter((allocation) => !selectedMonth || Number(allocation.estimatedHours) > 0).map((allocation) => allocation.personExternalId),
    ...(!selectedMonth ? roles.flatMap((role) => role.defaultPersonExternalId ? [role.defaultPersonExternalId] : []) : []),
  ]).size;
  const totalHours = displayedAllocations.reduce((sum, allocation) => sum + Number(allocation.estimatedHours), 0);
  const factRoots = [...epics, ...standaloneFeatures];
  const totalActualHours = selectedMonth ? monthlyFact?.totalHours ?? null : factRoots.reduce((sum, item) => sum + Number(item.actualHours ?? 0), 0);
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
  const factRoleIds = new Set(projectRoleFact.keys());
  let hasUnattributedFact = projectUnattributedFact !== 0;
  for (const item of [...epics, ...features]) {
    const byRole = roleFact?.byItem.get(item.id);
    for (const [roleId, hours] of byRole ?? []) {
      if (hours) factRoleIds.add(roleId);
    }
    if (item.actualHours !== null && unattributedFact(Number(item.actualHours), byRole)) hasUnattributedFact = true;
  }
  const factRoles = roles.filter((role) => factRoleIds.has(role.id));
  const planColumns = showPlanRoles ? visibleRoles : [];
  const factColumns = showFactRoles ? factRoles : [];
  const showUnattributedFact = showFactRoles && hasUnattributedFact;
  const factColumnCount = factColumns.length + Number(showUnattributedFact);
  const headerRowSpan = planColumns.length || factColumnCount ? 2 : 1;
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
    )}>{displayHours(hours)}</td>
  );

  function renderItemRow(item: RoadmapWorkItem, isEpic = false, childCount = 0, collapsed = false, onToggle?: () => void, isChild = false, isLastChild = false) {
    const epicChildren = isEpic ? features.filter((feature) => feature.parentExternalId === item.externalId) : [];
    const itemAllocations = isEpic ? [...item.allocations, ...epicChildren.flatMap((feature) => feature.allocations)] : item.allocations;
    const itemHours = itemAllocations.reduce((sum, allocation) => sum + Number(allocation.estimatedHours), 0);
    const actualHours = selectedMonth ? item.actualHours : Number(item.actualHours ?? 0);
    const actualByRole = roleFact?.byItem.get(item.id);
    const featureCountForm = isEpic ? FEATURE_COUNT_PLURALS.select(childCount) : null;
    return (
      <tr key={item.id} className={`group/row align-top transition-colors ${isEpic ? 'border-t border-border bg-muted/30 hover:bg-muted/45' : 'border-t border-border/50 hover:bg-muted/15'}`}>
        <th scope="row" className={`py-2 text-left font-normal ${isEpic ? 'border-l-2 border-l-primary/40 px-3 sm:px-4' : isChild ? 'px-0' : 'px-3 sm:px-4'}`}>
          {isEpic ? (
            <div className="-ml-1 grid grid-cols-[1.75rem_1rem_minmax(0,1fr)] items-start gap-x-2">
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
                <div className="text-sm leading-5 font-semibold text-foreground [overflow-wrap:anywhere]">{item.title}</div>
                <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-xs leading-4 text-muted-foreground">
                  <span className="min-w-0 tabular-nums [overflow-wrap:anywhere]">Epic #{item.externalId}{item.state ? ` · ${item.state}` : ''}</span>
                  <span className="rounded bg-muted/70 px-1.5 whitespace-nowrap font-medium tabular-nums">
                    {childCount} {featureCountForm === 'one' ? 'фича' : featureCountForm === 'few' ? 'фичи' : 'фич'}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className={isChild
              ? `relative pl-7 before:absolute before:left-2 before:top-[-8px] before:border-l-2 before:border-border/80 after:absolute after:left-2 after:top-3 after:w-5 after:border-t-2 after:border-border/80 ${isLastChild ? 'before:h-5' : 'before:bottom-[-8px]'}`
              : 'pl-3'}>
              <div className="flex min-w-0 items-start gap-2">
                <AzureWorkItemIcon type={item.type} className="mt-0.5" />
                <span className="min-w-0 text-sm leading-snug [overflow-wrap:anywhere]">{item.title}</span>
              </div>
              <p className="mt-0.5 pl-6 text-[11px] text-muted-foreground">
                <span className="mr-1">Feature</span>
                #{item.externalId}{item.state ? ` · ${item.state}` : ''}
              </p>
            </div>
          )}
        </th>
        <td className={`whitespace-nowrap border-l border-border/60 px-3 py-2.5 text-right text-sm tabular-nums ${itemHours ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
          {displayHours(itemHours)}
        </td>
        <td className={`whitespace-nowrap px-3 py-2.5 text-right text-sm tabular-nums ${Number(actualHours) ? 'font-medium text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground'}`}>
          {displayHours(actualHours)}
        </td>
        {planColumns.map((role) => {
          const sourceEstimate = azureRoleEstimate(item, role);
          const allocations = item.allocations.filter((allocation) => allocation.roleId === role.id);
          const rolePeople = people.filter((person) => role.members?.some((member) => member.personExternalId === person.id && member.personIsActive));
          const featureAllocations = isEpic ? epicChildren.flatMap((feature) => feature.allocations.filter((allocation) => allocation.roleId === role.id)) : [];
          const canEdit = !selectedMonth && rolePeople.length > 0 && (!isEpic || showEpicAssignments);
          const sumHours = (list: RoadmapAllocation[]) => list.reduce((sum, allocation) => sum + Number(allocation.estimatedHours), 0);
          const editorProps = {
            item, role, people: rolePeople, quarterLabel: currentQuarterLabel, saving: saveMutation.isPending, onSave: saveAllocation,
            azure: writeBackEnabled ? { onRetry: canPushToAzure ? (allocationId: string) => pushAllocationMutation.mutate(allocationId) : undefined, retrying: pushAllocationMutation.isPending } : undefined,
          };
          const personLine = ({ name, email, hours, mock, placeholder, status }: { name: string; email?: string | null; hours: string; mock?: boolean; placeholder?: boolean; status?: React.ReactNode }) => (
            <span className="flex w-full min-w-0 items-center gap-2 px-1.5 py-1 text-left">
              <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${placeholder ? 'border border-dashed border-muted-foreground/40 text-muted-foreground' : 'bg-primary/10 text-primary'}`}>{name.slice(0, 1)}</span>
              <span title={email ?? undefined} className={`min-w-0 flex-1 truncate text-xs ${placeholder ? 'text-muted-foreground' : 'font-medium text-foreground'}`}>{name}</span>
              {mock ? <span className="shrink-0 rounded bg-amber-500/10 px-1 py-px text-[9px] font-medium uppercase text-amber-700 dark:text-amber-300">демо</span> : null}
              {status}
              <span className={`shrink-0 text-xs tabular-nums ${placeholder ? 'text-muted-foreground/60 group-hover/chip:text-primary' : 'font-medium text-foreground'}`}>{hours}</span>
            </span>
          );
          const chipClassName = 'group/chip block w-full rounded-md transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30';
          const assignmentList = <>
            {allocations.map((allocation) => {
              const line = personLine({
                name: allocation.personName,
                email: allocation.personEmail,
                hours: displayHours(allocation.estimatedHours),
                mock: people.find((person) => person.id === allocation.personExternalId)?.isMock,
                status: writeBackEnabled ? <AzureSyncMark allocation={allocation} /> : undefined,
              });
              return canEdit
                ? <AllocationEditor key={allocation.id} {...editorProps} initial={allocation} trigger={<button type="button" className={chipClassName} aria-label={`Изменить оценку: ${allocation.personName}`}>{line}</button>} />
                : <div key={allocation.id}>{line}</div>;
            })}
            {!selectedMonth && !isEpic && !allocations.length && role.defaultPersonExternalId && role.defaultPersonName ? (canEdit
              ? <AllocationEditor {...editorProps} defaultPersonExternalId={role.defaultPersonExternalId} trigger={<button type="button" className={chipClassName} title="Человек по умолчанию для роли. Нажмите, чтобы задать оценку">{personLine({ name: role.defaultPersonName, email: role.defaultPersonEmail, hours: 'оценить', placeholder: true })}</button>} />
              : personLine({ name: role.defaultPersonName, email: role.defaultPersonEmail, hours: '—', placeholder: true })) : null}
          </>;
          const hasContent = allocations.length > 0 || (!isEpic && Boolean(role.defaultPersonName));
          const actions = canEdit ? <div className={`flex items-center gap-0.5 ${hasContent ? 'opacity-0 transition-opacity focus-within:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100' : ''}`}>
            <AllocationEditor {...editorProps} defaultPersonExternalId={null} trigger={<button type="button" className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"><Plus className="h-3 w-3" />{hasContent ? 'Участник' : isEpic ? 'Назначить на эпик' : 'Назначить'}</button>} />
            {!isEpic && allocations.length > 1 ? <button type="button" disabled={saveMutation.isPending || splitMutation.isPending} title="Распределить часы поровну между участниками" onClick={() => splitMutation.mutate(allocations.map(({ id }) => id))} className="inline-flex h-6 items-center gap-1 rounded px-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground disabled:opacity-50"><Equal className="h-3 w-3" />{splitMutation.isPending ? 'Делим…' : 'Поровну'}</button> : null}
          </div> : null;
          return (
            <td key={role.id} className="min-w-52 border-l border-border/40 px-1.5 py-1.5">
              {sourceEstimate !== null ? <p className="flex items-center gap-1.5 px-1.5 py-1 text-xs font-medium tabular-nums text-sky-700 dark:text-sky-300"><RefreshCw aria-hidden="true" className="size-3 shrink-0" />План Azure: {sourceEstimate} ч</p> : null}
              {isEpic ? <div className="space-y-1">
                <p className="px-1.5 py-1 text-xs">{featureAllocations.length
                  ? <><span className="font-medium tabular-nums text-foreground">{displayHours(sumHours(featureAllocations))}</span><span className="text-muted-foreground"> · {featureAllocations.length} назн. в фичах</span></>
                  : <span className="text-muted-foreground/50">—</span>}</p>
                {showEpicAssignments ? <div className="ml-1.5 space-y-0.5 border-l-2 border-border pl-1">
                  {assignmentList}
                  {actions ?? (!selectedMonth && !rolePeople.length ? <p className="px-1.5 py-1 text-[11px] text-muted-foreground">Нет участников роли</p> : null)}
                </div> : allocations.length ? <p className="px-1.5 text-[11px] text-muted-foreground">+ {displayHours(sumHours(allocations))} на эпике</p> : null}
              </div> : <div className="space-y-0.5">
                {assignmentList}
                {selectedMonth ? !allocations.length && <span className="px-1.5 text-xs text-muted-foreground/50">—</span> : rolePeople.length ? actions : (
                  <p className="px-1.5 py-1 text-[11px] text-muted-foreground">
                    {people.length ? 'Нет участников роли' : 'Пользователи не синхронизированы'}
                    {canConfigure ? <> · <Link href={people.length ? roleSettingsHref : routes.roadmapAdminUsers} className="text-primary hover:underline">{people.length ? 'добавить' : 'синхронизировать'}</Link></> : null}
                  </p>
                )}
              </div>}
            </td>
          );
        })}
        {factColumns.map((role) => renderFactCell(actualHours === null ? null : actualByRole?.get(role.id) ?? 0, role.id))}
        {showUnattributedFact ? renderFactCell(actualHours === null ? null : unattributedFact(Number(actualHours), actualByRole), 'unattributed') : null}
      </tr>
    );
  }

  const errors = [connectionQuery.error, projectsQuery.error, peopleQuery.error, planQuery.error, isSelectedProjectSync ? syncMutation.error : null, saveMutation.error, saveQuarterMutation.error, splitMutation.error, addRoleMutation.error, setRoleDefaultMutation.error, roleCatalogQuery.error, pushAllocationMutation.error];
  const loadingMessage = projectsQuery.isLoading
    ? 'Загружаем проекты Azure DevOps…'
    : planQuery.isLoading
      ? 'Загружаем план проекта…'
      : connectionQuery.isLoading
        ? 'Проверяем подключение к Azure DevOps…'
        : null;
  const emptyPlanMessage = configured && !projectsQuery.isError && !roadmapProjectId
    ? selectedProject
      ? 'Загрузите выбранный проект, чтобы получить задачи, роли и оценки из Azure DevOps.'
      : 'Выберите проект Azure DevOps выше.'
    : null;

  return (
    <main className="roadmap-scrollbar relative min-h-0 flex-1 overflow-auto overscroll-none px-4 py-5 sm:px-6 lg:px-8">
        <div className="mx-auto flex min-h-full w-full flex-col gap-5">
          <h1 className="sr-only">План проекта</h1>
          <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">
            <AzureProjectPicker
              projects={projects}
              value={activeAzureProjectId}
              onChange={setSelectedAzureProjectId}
              disabled={projectsQuery.isLoading}
              placeholder={demoMode ? 'Демо-проект' : configured ? 'Выбрать проект Azure DevOps' : 'Выбрать локальный проект'}
            />
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

          {demoMode ? (
            <section role="status" className="rounded-xl border border-primary/20 bg-primary/[0.035] p-4 text-sm text-foreground">
              <p className="font-medium">Демо-роадмап на Vercel</p>
              <p className="mt-1 text-muted-foreground">Здесь можно менять назначения, роли и часы. Изменения сохраняются на сервере Vercel и будут видны всем, кто открыл эту демо-ссылку.</p>
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
          {errors.map((error, index) => error ? <ErrorMessage key={index} error={error} /> : null)}
          {syncResult ? (
            <div role="status" className="space-y-1 rounded-lg border border-border bg-card px-4 py-3 text-sm">
              <p>Задач из Azure DevOps: {syncResult.importedWorkItems}.{!syncResult.roleSyncWarning && syncResult.importedRoles !== undefined ? ` Ролей из Azure DevOps: ${syncResult.importedRoles}.` : null}</p>
              {syncResult.roleSyncWarning ? <p className="text-amber-800 dark:text-amber-200">{syncResult.roleSyncWarning}</p> : null}
            </div>
          ) : null}

          {plan ? (
            <>
              <RoadmapTopbar>
                <dl className="grid grid-cols-3 divide-x divide-border border-t border-border pt-2 lg:flex lg:border-t-0 lg:pt-0">
                  <div className="flex flex-col justify-between gap-0.5 pr-2 lg:px-4">
                    <dt className="text-xs leading-tight text-muted-foreground">Эпики и фичи</dt>
                    <dd className="text-sm font-semibold tabular-nums text-foreground">{epics.length + features.length}</dd>
                  </div>
                  <div className="flex flex-col justify-between gap-0.5 px-2 lg:px-4">
                    <dt className="text-xs leading-tight text-muted-foreground">План на {selectedMonth ? monthOptionLabel(selectedMonth) : currentQuarterLabel}</dt>
                    <dd className="text-sm font-semibold tabular-nums text-foreground">{hoursFormat.format(view === 'periods' ? quarterTotalHours : totalHours)} <span className="text-xs font-normal text-muted-foreground">часов</span></dd>
                  </div>
                  <div className="flex flex-col justify-between gap-0.5 pl-2 lg:px-4">
                    <dt className="text-xs leading-tight text-muted-foreground">Участники в плане</dt>
                    <dd className="flex items-center gap-1.5 text-sm font-semibold tabular-nums text-foreground"><Users aria-hidden="true" className="size-3.5 text-muted-foreground" />{assignedPeopleCount}</dd>
                  </div>
                </dl>
              </RoadmapTopbar>

              {createdTasks.length > 0 && (
                <details className="rounded-xl border border-border bg-card">
                  <summary className="cursor-pointer rounded-xl px-4 py-3 text-sm font-medium focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring">
                    Задачи, созданные из Roadmap <span className="ml-1 tabular-nums text-muted-foreground">{createdTasks.length}</span>
                  </summary>
                  <ul className="max-h-64 divide-y divide-border overflow-y-auto border-t border-border px-4">
                    {createdTasks.map((item) => <li key={item.id} className="flex items-start gap-2 py-2.5 text-sm">
                      <AzureWorkItemIcon type={item.type} className="mt-0.5" />
                      {item.url ? (
                        <a href={item.url} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-start gap-2 rounded-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-ring">
                          <span className="min-w-0 break-words">#{item.externalId} · {item.title}</span>
                          <ExternalLink aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                        </a>
                      ) : <span className="min-w-0 break-words">#{item.externalId} · {item.title}</span>}
                    </li>)}
                  </ul>
                </details>
              )}

              {focusMode ? <div className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm" aria-hidden="true" /> : null}
              <section
                role={focusMode ? 'dialog' : undefined}
                aria-modal={focusMode ? true : undefined}
                aria-label={focusMode ? 'Режим заполнения плана' : undefined}
                className={focusMode
                  ? 'fixed inset-3 z-50 flex h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-xl border border-border bg-card shadow-2xl'
                  : 'flex min-h-[420px] flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card'}
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <div>
                    <h2 className="font-medium text-foreground">{plan.name}</h2>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {!demoMode && configured && !usingCachedProjects && projectIsSynced ? <>Автообновление каждые 5 мин · </> : null}
                      {plan.syncedAt ? <>Последний импорт: <time dateTime={plan.syncedAt}>{new Date(plan.syncedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}</time></> : 'Данные ещё не синхронизированы'}
                      {writeBackEnabled ? <> · Запись в Azure: {plan.azure?.mode === 'manual' ? 'по кнопке' : 'автоматически'}{azureErrorCount ? <span className="text-destructive"> · ошибок: {azureErrorCount}</span> : null}</> : null}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {canPushToAzure ? <Popover open={pushPreviewOpen} onOpenChange={setPushPreviewOpen}>
                      <PopoverTrigger asChild>
                        <Button type="button" variant={plan.azure?.mode === 'manual' && azureUnsyncedCount ? 'default' : 'outline'} size="sm" className="h-9 gap-2" disabled={!azureUnsyncedCount} title="Посмотреть и отправить изменения плана в Azure DevOps">
                          <ArrowUpFromLine className="h-4 w-4" />
                          {azureUnsyncedCount ? `Отправить в Azure (${azureUnsyncedCount})` : 'Всё в Azure'}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent align="end" side="bottom" sideOffset={8} collisionPadding={16} className="w-[min(560px,calc(100vw-2rem))] overflow-hidden rounded-xl p-0">
                        {pushPreviewOpen ? <AzurePushPreview projectId={roadmapProjectId} onDone={() => setPushPreviewOpen(false)} /> : null}
                      </PopoverContent>
                    </Popover> : null}
                    {canConfigure ? <Link href={roleSettingsHref} className="inline-flex h-9 items-center gap-2 rounded-md border border-input px-3 text-sm font-medium text-foreground hover:bg-muted"><Users aria-hidden="true" className="h-4 w-4" />Роли и участники</Link> : null}
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
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    {PERIOD_PLANNING_ENABLED ? <>
                      <Button type="button" size="sm" variant={view === 'roles' ? 'secondary' : 'ghost'} onClick={() => setView('roles')} className="h-8 gap-1.5"><Users className="h-3.5 w-3.5" />По ролям</Button>
                      <Button type="button" size="sm" variant={view === 'periods' ? 'secondary' : 'ghost'} onClick={() => setView('periods')} className="h-8 gap-1.5"><Clock3 className="h-3.5 w-3.5" />По периодам</Button>
                    </> : null}
                    {epics.length ? <Button type="button" size="sm" variant={showEpicAssignments ? 'secondary' : 'ghost'} onClick={() => {
                      if (view === 'roles' && !showEpicAssignments && roles.length) setRoleBreakdown('plan', true);
                      setShowEpicAssignments((value) => !value);
                    }} aria-pressed={showEpicAssignments} className="h-8 gap-1.5">{showEpicAssignments ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}{showEpicAssignments ? 'Скрыть назначения эпиков' : 'Показать назначения эпиков'}</Button> : null}
                    {view === 'roles' && showPlanRoles && roles.length > 0 && plan.workItems.length > 0 ? <>
                      <label className="relative inline-flex min-h-8 cursor-pointer items-center gap-2 rounded-md px-2 text-xs font-medium text-foreground hover:bg-muted">
                        <input
                          type="checkbox"
                          role="switch"
                          checked={plannedRolesOnly}
                          aria-describedby="roadmap-planned-roles-description"
                          onChange={(event) => {
                            const checked = event.target.checked;
                            setPlannedRolesOnlyByProject((current) => ({ ...current, [roadmapProjectId]: checked }));
                          }}
                          className="peer sr-only"
                        />
                        <span aria-hidden="true" className="relative h-[18px] w-8 shrink-0 rounded-full bg-muted-foreground peer-checked:bg-primary peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring after:absolute after:left-0.5 after:top-0.5 after:size-3.5 after:rounded-full after:bg-background after:content-[''] peer-checked:after:translate-x-3.5 motion-safe:after:transition-transform forced-colors:border forced-colors:border-[ButtonText] forced-colors:after:bg-[ButtonText]" />
                        <span>Только роли с планом</span>
                      </label>
                      <span id="roadmap-planned-roles-description" hidden>Роли с запланированными часами в выбранном периоде или с оценкой Azure DevOps на эпике или фиче. Оценка Azure относится ко всей карточке.</span>
                    </> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {view === 'periods' && focusMode ? <Button type="button" variant="outline" size="sm" className="h-8" onClick={() => setExpandedEpics(allEpicsExpanded ? new Set() : new Set(epics.map((epic) => epic.id)))}>{allEpicsExpanded ? 'Свернуть всё' : 'Развернуть всё'}</Button> : null}
                    {view === 'periods' ? <Button type="button" variant={showUnassignedPeriods ? 'secondary' : 'outline'} size="sm" className="h-8" onClick={() => setShowUnassignedPeriods((value) => !value)}>{showUnassignedPeriods ? 'Скрыть без назначений' : 'Показать без назначений'}</Button> : null}
                    {view === 'roles' ? <SearchableSelect
                      ariaLabel="Период плана"
                      value={selectedMonthKey}
                      onChange={setSelectedMonthKey}
                      searchable={false}
                      options={[
                        { value: '', label: 'Весь квартал' },
                        ...currentQuarterMonths.map((month) => ({ value: month.monthKey, label: monthOptionLabel(month) })),
                      ]}
                      className="h-8 min-h-8 w-auto max-w-full border-border bg-background px-2.5 py-0 text-xs font-medium shadow-xs hover:bg-muted"
                    /> : null}
                    <div className="flex items-center gap-1 rounded-lg border border-border bg-background p-0.5">
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Предыдущий квартал" onClick={() => shiftQuarter(-1)}><ChevronLeft aria-hidden="true" className="h-4 w-4" /></Button>
                      <span aria-live="polite" className="min-w-20 text-center text-xs font-semibold tabular-nums">{currentQuarterLabel}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Следующий квартал" onClick={() => shiftQuarter(1)}><ChevronRight aria-hidden="true" className="h-4 w-4" /></Button>
                    </div>
                    {createProject && plan.externalId === createProject.id && (
                      <CreateAzureWorkItem
                        key={createProject.id}
                        externalProjectId={createProject.id}
                        projectName={createProject.name}
                        items={plan.workItems}
                        people={people}
                        onCreated={(item, parentExternalId) => {
                          if (item.type !== 'Feature' || !parentExternalId) return;
                          const parent = epics.find((epic) => epic.externalId === parentExternalId);
                          if (parent) setExpandedEpics((current) => new Set(current).add(parent.id));
                        }}
                      />
                    )}
                  </div>
                </div>

                {selectedMonth ? <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border px-4 py-2 text-xs text-muted-foreground">
                  <p role="status">{demoMode ? 'Факт за месяц доступен в проектах Azure DevOps.' : monthlyFactQuery.isError ? (monthlyFact ? 'Не удалось обновить факт за месяц. Показаны последние загруженные данные.' : 'Не удалось загрузить факт за месяц.') : monthlyFactQuery.isFetching ? 'Загружаем факт за месяц…' : 'План по месяцам доступен для просмотра.'}</p>
                  {!demoMode && monthlyFactQuery.isError ? <Button type="button" size="sm" variant="outline" className="h-7" onClick={() => void monthlyFactQuery.refetch()}>Повторить</Button> : null}
                </div> : null}

                {roles.length && !people.length && configured ? <div className="border-b border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">Чтобы назначать людей на роли, сначала синхронизируйте пользователей Azure DevOps в администрировании Roadmap.</div> : null}

                {!epics.length && !features.length ? (
                  <div className="px-6 py-12 text-center text-sm text-muted-foreground">
                    В проекте пока нет эпиков или фич.{canImportProject ? ' Загрузите проект из Azure DevOps.' : createProject ? ' Создайте первую карточку.' : ''}
                  </div>
                ) : (
                  <div className={focusMode ? 'flex min-h-0 flex-1 flex-col overflow-hidden' : 'flex flex-1 flex-col'}>
                    {!roles.length ? (
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/20 px-4 py-3">
                        <div>
                          <p className="text-sm font-medium text-foreground">Эпики и связанные фичи загружены</p>
                          <p className="mt-0.5 text-xs text-muted-foreground">Добавьте роли и закрепите за ними сотрудников, чтобы распределять часы по фичам.</p>
                        </div>
                        {canConfigure ? <Link href={roleSettingsHref} className="inline-flex h-9 items-center gap-2 rounded-md border border-input bg-background px-3 text-sm font-medium text-foreground hover:bg-muted"><Users aria-hidden="true" className="h-4 w-4" />Настроить роли</Link> : null}
                      </div>
                    ) : null}
                    {view === 'roles' && showPlanRoles && plannedRolesOnly && roles.length > 0 && visibleRoles.length === 0 ? (
                      <p id="roadmap-plan-roles" role="status" className="border-b border-border bg-muted/20 px-4 py-3 text-sm text-muted-foreground">
                        В выбранном периоде нет оценок по ролям. Выключите фильтр «Только роли с планом», чтобы увидеть все роли.
                      </p>
                    ) : null}
                    {view === 'periods' ? <QuarterPlanningGrid
                      epics={epics}
                      features={features}
                      months={currentQuarterMonths}
                      roles={roles}
                      roleSettingsHref={canConfigure ? roleSettingsHref : undefined}
                      saving={saveQuarterMutation.isPending || saveMutation.isPending}
                      focusMode={focusMode}
                      nameColumnWidth={nameColumnWidth}
                      onNameColumnWidthChange={setNameColumnWidth}
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
                      showEpicAssignments={showEpicAssignments}
                    /> : <div
                      role={headerRowSpan === 2 ? 'region' : undefined}
                      aria-label={headerRowSpan === 2 ? 'Таблица плана и факта по ролям' : undefined}
                      tabIndex={headerRowSpan === 2 ? 0 : undefined}
                      className={cn('@container roadmap-scrollbar min-w-0 flex-1 overflow-auto focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring', focusMode ? 'min-h-0' : 'max-h-[calc(100dvh-7rem)]')}
                    >
                      <table
                        className="w-full table-fixed border-collapse text-left [--summary-width:5rem] @lg:[--summary-width:7.5rem]"
                        style={{
                          '--name-width': `min(${nameColumnWidth}px, max(0px, calc(100cqw - 2 * var(--summary-width))))`,
                          minWidth: `calc(var(--name-width) + 2 * var(--summary-width) + ${260 * planColumns.length + 128 * factColumnCount}px)`,
                        } as CSSProperties}
                      >
                      <colgroup>
                        <col className="w-[var(--name-width)]" />
                        <col className="w-[var(--summary-width)]" />
                        <col className="w-[var(--summary-width)]" />
                      </colgroup>
                      {planColumns.length ? <colgroup>{planColumns.map((role) => <col key={role.id} className="w-[260px]" />)}</colgroup> : null}
                      {factColumnCount ? <colgroup span={factColumnCount} className="w-32" /> : null}
                      <thead className="sticky top-0 z-[1] bg-card">
                        <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                          <th scope="col" rowSpan={headerRowSpan} className="relative px-3 py-2.5 @lg:px-4 @lg:pr-5"><div className="flex items-center justify-between gap-1 @lg:gap-3"><span>Эпик / фича</span>{canConfigure ? <Popover open={rolePickerOpen} onOpenChange={setRolePickerOpen}>
                            <PopoverTrigger asChild><Button type="button" variant="outline" size="sm" className="h-8 shrink-0 gap-1 px-2 text-xs @lg:px-2.5" aria-label="Добавить роль" title="Добавить роль" disabled={!roadmapProjectId || addRoleMutation.isPending}><Plus aria-hidden="true" className="size-3.5" /><span className="hidden @lg:inline">Добавить роль</span></Button></PopoverTrigger>
                            <PopoverContent align="start" side="bottom" sideOffset={8} collisionPadding={16} className="w-[min(320px,calc(100vw-2rem))] rounded-xl p-2">
                              <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Роли из каталога</p>
                              {roleCatalogQuery.isLoading ? <p className="px-2 py-4 text-center text-sm text-muted-foreground">Загружаем каталог…</p> : availableRoleTemplates.length ? availableRoleTemplates.map((template) => <button key={template.id} type="button" disabled={addRoleMutation.isPending} onClick={() => addRoleMutation.mutate({ projectId: roadmapProjectId, templateId: template.id })} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-50"><ColorMark color={template.color} size="md" /><span className="min-w-0 flex-1 truncate">{template.name}</span>{template.isMock ? <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium uppercase text-amber-700 dark:text-amber-300">демо</span> : null}<Plus className="h-3.5 w-3.5 text-muted-foreground" /></button>) : <div className="px-2 py-3 text-sm text-muted-foreground">{(roleCatalogQuery.data ?? []).length ? 'Все роли из каталога уже добавлены.' : 'Каталог ролей пуст.'}{!(roleCatalogQuery.data ?? []).length ? <Link href={routes.roadmapAdminRoles} className="mt-1 block text-primary hover:underline">Создать роли в администрировании</Link> : null}</div>}
                            </PopoverContent>
                          </Popover> : null}</div><div className="hidden @lg:block"><NameColumnResizeHandle width={nameColumnWidth} onChange={setNameColumnWidth} /></div></th>
                          <th scope="col" rowSpan={headerRowSpan} className="border-l border-border/60 px-1 py-1.5 text-right @lg:px-2">
                            <BreakdownHeading label="План" kind="plan" expanded={showPlanRoles} onToggle={roles.length ? () => setRoleBreakdown('plan', !showPlanRoles) : undefined} />
                          </th>
                          <th scope="col" rowSpan={headerRowSpan} className="px-1 py-1.5 text-right @lg:px-2" title={selectedMonth ? 'Изменение Completed Work за выбранный календарный месяц (UTC)' : undefined}>
                            <BreakdownHeading label={selectedMonth ? 'Факт за месяц' : 'Факт всего'} kind="fact" expanded={showFactRoles} onToggle={factRoles.length || hasUnattributedFact ? () => setRoleBreakdown('fact', !showFactRoles) : undefined} />
                          </th>
                          {planColumns.length ? <th scope="colgroup" id="roadmap-plan-roles" colSpan={planColumns.length} className="border-l border-border/60 px-3 py-1.5">План по ролям</th> : null}
                          {factColumnCount ? <th scope="colgroup" id="roadmap-fact-roles" colSpan={factColumnCount} className="border-l border-border/60 px-3 py-1.5">{selectedMonth ? 'Факт за месяц по ролям' : 'Факт по ролям'}</th> : null}
                        </tr>
                        {headerRowSpan === 2 ? <tr className="border-b border-border bg-muted/25">
                          {planColumns.map((role) => <th scope="col" key={role.id} className="border-l border-border/40 px-3 py-2.5">
                            <div className="space-y-1.5">
                              <div className="flex items-center gap-2 normal-case tracking-normal">
                                <RoleMark name={role.name} color={role.color} size="sm" />
                                <span className="min-w-0 truncate text-[13px] font-semibold text-foreground" title={role.name}>{role.name}</span>
                                {role.azureEstimateField ? <span role="img" aria-label="Роль из Azure DevOps" className="shrink-0 text-primary" title="Роль из Azure DevOps"><RefreshCw aria-hidden="true" className="size-3.5" /></span> : null}
                                {role.isMock && !/демо/i.test(role.name) ? <span className="rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium normal-case text-amber-700 dark:text-amber-300">демо</span> : null}
                              </div>
                              {canConfigure && !selectedMonth ? <Popover open={defaultRolePickerId === role.id} onOpenChange={(open) => setDefaultRolePickerId(open ? role.id : null)}>
                                <PopoverTrigger asChild><button type="button" className="flex max-w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[10px] font-medium normal-case text-muted-foreground transition-colors hover:bg-card hover:text-foreground"><Users className="h-3 w-3 shrink-0" /><span className="truncate">{role.defaultPersonName ? `По умолчанию: ${role.defaultPersonName}` : 'Закрепить человека по умолчанию'}</span></button></PopoverTrigger>
                                <PopoverContent align="start" side="bottom" sideOffset={6} collisionPadding={16} className="w-[min(300px,calc(100vw-2rem))] rounded-xl p-2">
                                  <p className="px-2 py-1.5 text-xs font-medium text-muted-foreground">Человек по умолчанию · {role.name}</p>
                                  {(role.members ?? []).filter((member) => member.personIsActive).map((member) => <button key={member.personExternalId} type="button" disabled={setRoleDefaultMutation.isPending || role.defaultPersonExternalId === member.personExternalId} onClick={() => setRoleDefaultMutation.mutate({ roleId: role.id, personExternalId: member.personExternalId })} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm text-foreground hover:bg-muted disabled:opacity-60"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">{member.personName.slice(0, 1)}</span><span className="min-w-0 flex-1"><span className="block truncate">{member.personName}</span><span className="block truncate text-[10px] text-muted-foreground">{member.personEmail}</span></span>{role.defaultPersonExternalId === member.personExternalId ? <Check className="h-4 w-4 text-primary" /> : null}</button>)}
                                  {!(role.members ?? []).some((member) => member.personIsActive) ? <div className="px-2 py-3 text-sm text-muted-foreground">Сначала добавьте участника в эту роль в администрировании.</div> : null}
                                  {role.defaultPersonExternalId ? <button type="button" disabled={setRoleDefaultMutation.isPending} onClick={() => setRoleDefaultMutation.mutate({ roleId: role.id, personExternalId: null })} className="mt-1 w-full rounded-lg border-t border-border px-2 py-2 text-left text-xs text-muted-foreground hover:text-foreground">Снять назначение по умолчанию</button> : null}
                                </PopoverContent>
                              </Popover> : role.defaultPersonName ? <span className="block truncate text-[10px] font-medium normal-case text-muted-foreground">По умолчанию: {role.defaultPersonName}</span> : null}
                            </div>
                          </th>)}
                          {factColumns.map((role) => <th scope="col" key={role.id} className="border-l border-border/40 px-3 py-2.5 text-right text-xs font-semibold">
                            <span className="flex items-center justify-end gap-1.5"><RoleMark name={role.name} color={role.color} size="sm" /><span className="min-w-0 [overflow-wrap:anywhere]">{role.name}</span></span>
                          </th>)}
                          {showUnattributedFact ? <th scope="col" className="border-l border-border/40 px-3 py-2.5 text-right text-xs font-semibold">Без роли</th> : null}
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
                      </tbody>
                      <tfoot className="sticky bottom-0 z-[1] bg-card">
                        <tr className="border-t-2 border-border bg-muted/40 text-sm font-semibold text-foreground">
                          <th scope="row" className="px-3 py-3 @lg:px-4">Итого по проекту</th>
                          <td className="whitespace-nowrap border-l border-border/60 px-3 py-3 text-right tabular-nums">{displayHours(totalHours)}</td>
                          <td className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${totalActualHours === null ? 'text-muted-foreground' : 'text-emerald-700 dark:text-emerald-300'}`}>{displayHours(totalActualHours)}</td>
                          {planColumns.map((role) => {
                            const hours = displayedAllocations.reduce((sum, allocation) => sum + (allocation.roleId === role.id ? Number(allocation.estimatedHours) : 0), 0);
                            return <td key={role.id} className={`border-l border-border/40 px-3 py-3 tabular-nums ${hours ? '' : 'text-muted-foreground/50'}`}>{displayHours(hours)}</td>;
                          })}
                          {factColumns.map((role) => renderFactCell(totalActualHours === null ? null : projectRoleFact.get(role.id) ?? 0, role.id))}
                          {showUnattributedFact ? renderFactCell(projectUnattributedFact, 'unattributed') : null}
                        </tr>
                      </tfoot>
                    </table></div>}
                  </div>
                )}
              </section>
            </>
          ) : loadingMessage || emptyPlanMessage ? (
            <div role={loadingMessage ? 'status' : undefined} className="rounded-xl border border-border bg-card px-6 py-12 text-center">
              {loadingMessage ? <RefreshCw aria-hidden="true" className="mx-auto h-6 w-6 text-muted-foreground motion-safe:animate-spin" /> : <ArrowDownToLine aria-hidden="true" className="mx-auto h-7 w-7 text-muted-foreground" />}
              <p className="mt-3 text-sm text-muted-foreground">
                {loadingMessage ?? emptyPlanMessage}
              </p>
            </div>
          ) : null}
        </div>
    </main>
  );
}
