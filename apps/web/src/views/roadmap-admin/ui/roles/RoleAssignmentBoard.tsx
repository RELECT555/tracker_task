import { type DragEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ArrowDownToLine, BookOpen, GripVertical, Layers3, Plus, RefreshCw, Search, Settings2, Trash2 } from 'lucide-react';
import type { RoadmapRole, RoadmapRoleTemplate } from '@/entities/roadmap/api/roadmapApi';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { RoleMark } from '@/shared/ui/color-mark';
import { Input } from '@/shared/ui/input';
import { normalizeRoleName } from '../../model/role-name';
import { AdminAlert } from '../AdminLayout';
import styles from './role-assignment-board.module.css';
import { setRoleDragImage } from './role-drag-image';

const roleDragType = 'application/x-roadmap-role';
const roleNoticeDuration = 4_000;
const panelClass = 'flex min-h-0 min-w-0 flex-col overflow-hidden rounded-xl border border-border bg-card';
const plurals = new Intl.PluralRules('ru-RU');

function memberCount(role: RoadmapRole) {
  const ids = new Set(role.members?.map((member) => member.personExternalId));
  if (role.defaultPersonExternalId) ids.add(role.defaultPersonExternalId);
  if (!ids.size) return 'Нет участников';
  const form = plurals.select(ids.size);
  return `${ids.size} ${form === 'one' ? 'участник' : form === 'few' ? 'участника' : 'участников'}`;
}

function RoleSearch({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input type="search" aria-label={label} placeholder="Найти роль" value={value} onChange={(event) => onChange(event.target.value)} className="h-9 pl-9 shadow-none" />
    </div>
  );
}

function RoleSuccessNotice({ children, className, autoDismiss }: {
  children: ReactNode;
  className: string;
  autoDismiss: boolean;
}) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (!autoDismiss) return;
    const timer = window.setTimeout(() => setVisible(false), roleNoticeDuration);
    return () => window.clearTimeout(timer);
  }, [autoDismiss]);

  if (!visible) return null;
  return <div className={className}><AdminAlert tone="success">{children}</AdminAlert></div>;
}

type RoleAssignmentBoardProps = {
  projectName: string;
  roles: RoadmapRole[];
  availableRoles: RoadmapRoleTemplate[];
  catalogSize: number;
  catalogNotice?: ReactNode;
  addingRoleId?: string;
  addedRole?: Pick<RoadmapRole, 'id' | 'name'>;
  focusAddedRole?: boolean;
  removedRoleName?: string;
  status?: { message: string; autoDismiss: boolean };
  projectSearch: string;
  disabled: boolean;
  canAdd: boolean;
  onProjectSearchChange: (value: string) => void;
  onEditRole: (role: RoadmapRole) => void;
  onRemoveRole: (role: RoadmapRole) => void;
  onAddRole: (roleId: string, withKeyboard?: boolean) => void;
};

export function RoleAssignmentBoard({
  projectName, roles, availableRoles, catalogSize, catalogNotice, addingRoleId, addedRole, focusAddedRole, removedRoleName, status,
  projectSearch, disabled, canAdd, onProjectSearchChange, onEditRole, onRemoveRole, onAddRole,
}: RoleAssignmentBoardProps) {
  const id = useId();
  const projectHeading = useRef<HTMLHeadingElement>(null);
  const addedRoleButton = useRef<HTMLButtonElement>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [draggedRoleId, setDraggedRoleId] = useState<string>();
  const [overProject, setOverProject] = useState(false);
  const catalogTerm = normalizeRoleName(catalogSearch);
  const projectTerm = normalizeRoleName(projectSearch);
  const visibleCatalog = availableRoles.filter((role) => normalizeRoleName(role.name).includes(catalogTerm));
  const visibleRoles = roles.filter((role) => normalizeRoleName(role.name).includes(projectTerm));
  const draggedRole = canAdd ? availableRoles.find((role) => role.id === draggedRoleId) : undefined;

  useEffect(() => {
    const current = addedRoleButton.current;
    if (!current) return;
    if (focusAddedRole) current.focus({ preventScroll: true });
    current.scrollIntoView({ block: 'nearest' });
  }, [addedRole?.id, focusAddedRole]);

  useEffect(() => {
    if (removedRoleName) projectHeading.current?.focus();
  }, [removedRoleName]);

  function resetDrag() {
    setDraggedRoleId(undefined);
    setOverProject(false);
  }

  function handleDragOver(event: DragEvent<HTMLElement>) {
    if (!draggedRole || !event.dataTransfer.types.includes(roleDragType)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setOverProject(true);
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    if (!draggedRole || !event.dataTransfer.types.includes(roleDragType)) return;
    event.preventDefault();
    const roleId = event.dataTransfer.getData(roleDragType);
    resetDrag();
    if (roleId === draggedRole.id) onAddRole(roleId);
  }

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[clamp(16rem,24%,21rem)_minmax(0,1fr)]">
      <section aria-labelledby={`${id}-catalog`} className={panelClass}>
        <div className="shrink-0 space-y-3 border-b border-border px-4 py-3.5">
          <div className="flex items-center gap-2">
            <BookOpen aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <h2 id={`${id}-catalog`} className="flex-1 text-balance text-sm font-semibold">Добавить из каталога</h2>
            {availableRoles.length > 0 && <span className="text-xs tabular-nums text-muted-foreground">{availableRoles.length}</span>}
          </div>
          <p className="text-pretty text-xs leading-relaxed text-muted-foreground">Общие роли, которые ещё не добавлены в этот проект.</p>
          {availableRoles.length > 0 && <RoleSearch label="Поиск в каталоге ролей" value={catalogSearch} onChange={setCatalogSearch} />}
        </div>
        {catalogNotice && <div className="shrink-0 px-4 py-3">{catalogNotice}</div>}
        {visibleCatalog.length > 0 ? (
          <ul aria-label="Роли для добавления из каталога" className="space-y-2 p-3">
            {visibleCatalog.map((role) => (
              <li
                key={role.id}
                draggable={canAdd}
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'copy';
                  event.dataTransfer.setData(roleDragType, role.id);
                  setRoleDragImage(event.dataTransfer, event.currentTarget, role);
                  setDraggedRoleId(role.id);
                }}
                onDragEnd={resetDrag}
                className={cn(
                  'flex min-h-12 select-none items-center gap-2 rounded-lg border border-transparent px-2 py-1.5 text-sm hover:border-border hover:bg-muted/45 motion-safe:transition-opacity motion-safe:duration-150',
                  canAdd && 'cursor-grab active:cursor-grabbing [@media(pointer:coarse)]:cursor-auto',
                  draggedRole?.id === role.id && 'opacity-50',
                )}
              >
                <GripVertical aria-hidden="true" className="size-4 shrink-0 text-muted-foreground [@media(pointer:coarse)]:hidden" />
                <RoleMark name={role.name} color={role.color} size="sm" />
                <span className="min-w-0 flex-1 break-words font-medium">{role.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Добавить роль «${role.name}»`}
                  aria-disabled={!canAdd}
                  onClick={(event) => { if (canAdd) onAddRole(role.id, event.detail === 0); }}
                  className="shrink-0 gap-1.5 px-2 text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [@media(pointer:coarse)]:h-11"
                >
                  {addingRoleId === role.id ? 'Добавляем…' : <><Plus aria-hidden="true" className="size-3.5" /> Добавить</>}
                </Button>
              </li>
            ))}
          </ul>
        ) : !catalogNotice && (
          <div role="status" className="space-y-2 px-4 py-5 text-pretty text-sm">
            <p className="font-medium">
              {availableRoles.length ? 'Роли не найдены.' : catalogSize ? 'Все роли каталога уже в проекте' : 'Каталог пока пуст'}
            </p>
            {!availableRoles.length && !catalogSize && roles.some((role) => role.azureEstimateField) && (
              <p className="text-xs leading-relaxed text-muted-foreground">Роли из Azure DevOps уже показаны в разделе «Роли проекта».</p>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              {availableRoles.length ? 'Попробуйте другое название.' : catalogSize
                ? 'Участников и параметры можно настроить в разделе «Роли проекта».'
                : 'Создайте роль кнопкой «Новая роль» — она появится в проекте и станет доступна в каталоге для других проектов.'}
            </p>
          </div>
        )}
        {addedRole && (
          <RoleSuccessNotice key={addedRole.id} className="mt-auto shrink-0 border-t border-border p-3" autoDismiss>
            Роль «{addedRole.name}» добавлена в проект.
          </RoleSuccessNotice>
        )}
      </section>

      <section
          aria-labelledby={`${id}-project`}
          onDragOver={handleDragOver}
          onDragLeave={(event) => {
            if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
            setOverProject(false);
          }}
          onDrop={handleDrop}
          className={cn('@container motion-safe:transition-colors motion-safe:duration-150', panelClass, draggedRole && 'border-primary/55', draggedRole && overProject && 'ring-2 ring-primary/25')}
        >
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 border-b border-border px-5 py-4">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <Layers3 aria-hidden="true" className="size-4 shrink-0 text-primary" />
              <div className="min-w-0">
                <div className="flex items-baseline gap-1.5">
                  <h2 ref={projectHeading} id={`${id}-project`} tabIndex={-1} className="rounded-sm text-balance text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Роли проекта</h2>
                  <span className="text-xs tabular-nums text-muted-foreground">{roles.length}</span>
                </div>
                <p className="mt-0.5 break-words text-xs text-muted-foreground">{projectName}</p>
              </div>
            </div>
            {roles.length > 0 && <div className="w-full @min-[26rem]:w-52"><RoleSearch label="Поиск по ролям проекта" value={projectSearch} onChange={onProjectSearchChange} /></div>}
          </div>
          <div className="flex min-h-0 flex-col p-4 @min-[50rem]:p-5">
            {removedRoleName && (
              <RoleSuccessNotice key={removedRoleName} className="mx-1 mb-2" autoDismiss>
                Роль «{removedRoleName}» убрана из проекта.
              </RoleSuccessNotice>
            )}
            {status && (
              <RoleSuccessNotice key={status.message} className="mx-1 mb-2" autoDismiss={status.autoDismiss}>
                {status.message}
              </RoleSuccessNotice>
            )}
            {availableRoles.length > 0 && (
              <div className={cn(
                'mx-1 mb-1.5 flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-muted/30 px-3 py-2 text-center text-xs font-medium text-muted-foreground motion-safe:transition-colors motion-safe:duration-150 [@media(pointer:coarse)]:hidden',
                draggedRole && 'border-primary/60 bg-primary/5 text-foreground',
                draggedRole && overProject && 'border-primary bg-primary/15',
              )}>
                <ArrowDownToLine aria-hidden="true" className={cn('size-4 shrink-0 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out', draggedRole && overProject && 'motion-safe:translate-y-0.5')} />
                <span className="min-w-0 wrap-anywhere">{draggedRole && overProject ? `Отпустите, чтобы добавить «${draggedRole.name}»` : 'Перетащите роль из каталога сюда или нажмите «Добавить»'}</span>
              </div>
            )}
            {visibleRoles.length > 0 ? (
              <ul aria-label="Роли проекта" className="grid grid-cols-1 gap-4 @min-[38rem]:grid-cols-2 @min-[50rem]:grid-cols-3">
                {visibleRoles.map((role) => (
                  <li key={role.id} className={cn(
                    'relative flex min-w-0 flex-col justify-between rounded-xl border border-border bg-background/40 hover:bg-muted/40 focus-within:bg-muted/40',
                    role.id === addedRole?.id && styles.addedRole,
                  )}>
                    <button
                      type="button"
                      ref={role.id === addedRole?.id ? addedRoleButton : undefined}
                      aria-label={`Настроить роль «${role.name}»`}
                      aria-describedby={`${id}-members-${role.id}`}
                      aria-haspopup="dialog"
                      title="Настроить роль"
                      disabled={disabled}
                      onClick={() => onEditRole(role)}
                      className="flex min-h-16 min-w-0 items-start gap-3 rounded-lg p-4 pb-2 text-left text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      <RoleMark name={role.name} color={role.color} />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-pretty font-medium leading-5">{role.name}</span>
                      </span>
                      <Settings2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                    </button>
                    <div className="flex items-center gap-2 px-4 pb-2">
                      <span id={`${id}-members-${role.id}`} className="min-w-0 flex-1 text-xs text-muted-foreground">{memberCount(role)}</span>
                      {role.azureEstimateField && (
                        <span role="img" aria-label="Роль из Azure DevOps" className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground" title="Роль из Azure DevOps">
                          <RefreshCw aria-hidden="true" className="size-3.5" />
                          <span aria-hidden="true">Azure</span>
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Убрать роль «${role.name}» из проекта`}
                        title="Убрать роль из проекта"
                        disabled={disabled}
                        onClick={() => onRemoveRole(role)}
                        className="size-9 shrink-0 text-muted-foreground hover:bg-destructive/10 hover:text-destructive [@media(pointer:coarse)]:size-11"
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p role="status" className="px-2 py-4 text-center text-sm text-muted-foreground">{roles.length ? 'Роли не найдены.' : 'В проекте пока нет ролей.'}</p>
            )}
          </div>
      </section>
    </div>
  );
}
