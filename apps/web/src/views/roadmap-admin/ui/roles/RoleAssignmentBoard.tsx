import { type DragEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, GripVertical, Info, LoaderCircle, Plus, Search, Trash2 } from 'lucide-react';
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
const projectRoleDragType = 'application/x-roadmap-project-role';
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

function InfoHint({ text }: { text: string }) {
  return (
    <span role="img" aria-label={text} title={text} tabIndex={0} className="inline-flex size-4 shrink-0 cursor-help items-center justify-center self-center rounded-full text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
      <Info aria-hidden="true" className="size-3.5" />
    </span>
  );
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
  onDeleteTemplate: (template: RoadmapRoleTemplate) => void;
  onAddRole: (roleId: string, withKeyboard?: boolean) => void;
};

export function RoleAssignmentBoard({
  roles, availableRoles, catalogSize, catalogNotice, addingRoleId, addedRole, focusAddedRole, removedRoleName, status,
  projectSearch, disabled, canAdd, onProjectSearchChange, onEditRole, onRemoveRole, onDeleteTemplate, onAddRole,
}: RoleAssignmentBoardProps) {
  const id = useId();
  const projectHeading = useRef<HTMLHeadingElement>(null);
  const addedRoleButton = useRef<HTMLButtonElement>(null);
  const [catalogSearch, setCatalogSearch] = useState('');
  const [draggedRoleId, setDraggedRoleId] = useState<string>();
  const [overProject, setOverProject] = useState(false);
  const [draggedProjectRoleId, setDraggedProjectRoleId] = useState<string>();
  const [overCatalog, setOverCatalog] = useState(false);
  const catalogTerm = normalizeRoleName(catalogSearch);
  const projectTerm = normalizeRoleName(projectSearch);
  const visibleCatalog = availableRoles.filter((role) => normalizeRoleName(role.name).includes(catalogTerm));
  const visibleRoles = roles.filter((role) => normalizeRoleName(role.name).includes(projectTerm));
  const draggedProjectRole = disabled ? undefined : roles.find((role) => role.id === draggedProjectRoleId);
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
    setDraggedProjectRoleId(undefined);
    setOverCatalog(false);
  }

  function handleCatalogDragOver(event: DragEvent<HTMLElement>) {
    if (!draggedProjectRole || !event.dataTransfer.types.includes(projectRoleDragType)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setOverCatalog(true);
  }

  function handleCatalogDrop(event: DragEvent<HTMLElement>) {
    if (!draggedProjectRole || !event.dataTransfer.types.includes(projectRoleDragType)) return;
    event.preventDefault();
    const role = draggedProjectRole;
    const roleId = event.dataTransfer.getData(projectRoleDragType);
    resetDrag();
    if (roleId === role.id) onRemoveRole(role);
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

  const showDropSlot = availableRoles.length > 0 || Boolean(draggedRole);
  const dropSlot = (
    <div className={cn(
      'flex min-h-14 w-full min-w-0 items-center gap-3 rounded-lg border border-dashed border-border px-2 py-2 text-xs text-muted-foreground motion-safe:transition-colors motion-safe:duration-150',
      draggedRole && 'border-primary/60 bg-primary/5 text-foreground',
      draggedRole && overProject && 'border-solid border-primary bg-primary/15',
    )}>
      <span className={cn(
        'flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed border-current/40',
        draggedRole && 'border-primary text-primary',
      )}>
        <ArrowDownToLine className={cn('size-4 motion-safe:transition-transform motion-safe:duration-150 motion-safe:ease-out', overProject && 'motion-safe:translate-y-0.5')} />
      </span>
      <span className="min-w-0 flex-1 wrap-anywhere font-medium">
        {draggedRole
          ? overProject ? `Отпустите, чтобы добавить «${draggedRole.name}»` : `Перетащите сюда «${draggedRole.name}»`
          : 'Перетащите роль из каталога'}
      </span>
    </div>
  );

  return (
    <div className="grid items-start gap-5 lg:grid-cols-[clamp(16rem,24%,20rem)_minmax(0,1fr)]">
      <section
        aria-labelledby={`${id}-catalog`}
        onDragOver={handleCatalogDragOver}
        onDragLeave={(event) => {
          if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
          setOverCatalog(false);
        }}
        onDrop={handleCatalogDrop}
        className={cn('relative motion-safe:transition-colors motion-safe:duration-150', panelClass, draggedProjectRole && 'border-destructive/50', draggedProjectRole && overCatalog && 'ring-2 ring-destructive/25')}
      >
        {draggedProjectRole && (
          <div aria-hidden="true" className={cn(
            'pointer-events-none absolute inset-2 z-10 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-destructive/50 bg-card/90 p-4 text-center text-xs font-medium text-foreground',
            overCatalog && 'border-solid border-destructive bg-destructive/10',
          )}>
            <ArrowUpFromLine className="size-5 text-destructive" />
            {overCatalog ? `Отпустите, чтобы убрать «${draggedProjectRole.name}» из проекта` : `Перетащите сюда «${draggedProjectRole.name}», чтобы убрать из проекта`}
          </div>
        )}
        <div className="shrink-0 space-y-3 px-4 pb-3 pt-4">
          <div>
            <div className="flex items-baseline gap-1.5">
              <h2 id={`${id}-catalog`} className="text-balance text-sm font-semibold">Каталог</h2>
              {availableRoles.length > 0 && <span className="text-xs tabular-nums text-muted-foreground">{availableRoles.length}</span>}
              <InfoHint text="Роли, которых ещё нет в проекте. Перетащите роль в проект или нажмите «+». Чтобы убрать роль из проекта, перетащите её сюда." />
            </div>
          </div>
          {availableRoles.length > 0 && <RoleSearch label="Поиск в каталоге ролей" value={catalogSearch} onChange={setCatalogSearch} />}
        </div>
        {catalogNotice && <div className="shrink-0 px-4 pb-3">{catalogNotice}</div>}
        {visibleCatalog.length > 0 ? (
          <ul aria-label="Роли для добавления из каталога" className="space-y-0.5 px-2 pb-2">
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
                  'group flex min-h-11 select-none items-center gap-2 rounded-lg py-1 pl-1 pr-1 text-sm hover:bg-muted/50 motion-safe:transition-opacity motion-safe:duration-150',
                  canAdd && 'cursor-grab active:cursor-grabbing [@media(pointer:coarse)]:cursor-auto',
                  draggedRole?.id === role.id && 'opacity-50',
                )}
              >
                <GripVertical aria-hidden="true" className="size-4 shrink-0 text-muted-foreground/45 group-hover:text-muted-foreground [@media(pointer:coarse)]:hidden" />
                <RoleMark name={role.name} color={role.color} size="sm" />
                <span className="min-w-0 flex-1 break-words">{role.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Удалить роль «${role.name}» из каталога`}
                  title="Удалить из каталога"
                  disabled={disabled}
                  onClick={() => onDeleteTemplate(role)}
                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive focus-visible:text-destructive [@media(pointer:fine)]:opacity-0 [@media(pointer:fine)]:group-hover:opacity-100 [@media(pointer:fine)]:focus-visible:opacity-100 [@media(pointer:coarse)]:size-11"
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`Добавить роль «${role.name}»`}
                  title="Добавить в проект"
                  aria-disabled={!canAdd}
                  aria-busy={addingRoleId === role.id || undefined}
                  onClick={(event) => { if (canAdd) onAddRole(role.id, event.detail === 0); }}
                  className="size-8 shrink-0 text-muted-foreground hover:text-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-50 [@media(pointer:coarse)]:size-11"
                >
                  {addingRoleId === role.id
                    ? <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" />
                    : <Plus aria-hidden="true" className="size-4" />}
                </Button>
              </li>
            ))}
          </ul>
        ) : !catalogNotice && (
          <div role="status" className="space-y-1 px-4 pb-5 pt-1 text-pretty text-sm">
            <p className="font-medium">
              {availableRoles.length ? 'Роли не найдены.' : catalogSize ? 'Все роли каталога уже в проекте' : 'Каталог пока пуст'}
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {availableRoles.length ? 'Попробуйте другое название.' : catalogSize
                ? 'Участников можно настроить в списке ролей проекта.'
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
          className={cn('@container relative motion-safe:transition-colors motion-safe:duration-150', panelClass, draggedRole && 'border-primary/55', draggedRole && overProject && 'ring-2 ring-primary/25')}
        >
          <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-3 px-5 pb-3 pt-4">
            <div className="flex min-w-0 flex-1 items-baseline gap-1.5">
              <h2 ref={projectHeading} id={`${id}-project`} tabIndex={-1} className="rounded-sm text-balance text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">Роли проекта</h2>
              <span className="text-xs tabular-nums text-muted-foreground">{roles.length}</span>
            </div>
            {roles.length > 0 && <div className="w-full @min-[26rem]:w-56"><RoleSearch label="Поиск по ролям проекта" value={projectSearch} onChange={onProjectSearchChange} /></div>}
          </div>
          <div className="flex min-h-0 flex-col px-3 pb-3">
            {removedRoleName && (
              <RoleSuccessNotice key={removedRoleName} className="mx-2 mb-2" autoDismiss>
                Роль «{removedRoleName}» убрана из проекта.
              </RoleSuccessNotice>
            )}
            {status && (
              <RoleSuccessNotice key={status.message} className="mx-2 mb-2" autoDismiss={status.autoDismiss}>
                {status.message}
              </RoleSuccessNotice>
            )}
            {visibleRoles.length > 0 ? (
              <ul aria-label="Роли проекта" className="grid grid-cols-1 gap-x-2 gap-y-0.5 @min-[38rem]:grid-cols-2 @min-[60rem]:grid-cols-3">
                {showDropSlot && <li aria-hidden="true" className="flex [@media(pointer:coarse)]:hidden">{dropSlot}</li>}
                {visibleRoles.map((role) => (
                  <li
                    key={role.id}
                    draggable={!disabled}
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = 'move';
                      event.dataTransfer.setData(projectRoleDragType, role.id);
                      setRoleDragImage(event.dataTransfer, event.currentTarget, role);
                      setDraggedProjectRoleId(role.id);
                    }}
                    onDragEnd={resetDrag}
                    className={cn(
                      'group relative flex min-w-0 items-center rounded-lg hover:bg-muted/50 focus-within:bg-muted/50 motion-safe:transition-opacity motion-safe:duration-150',
                      !disabled && 'cursor-grab active:cursor-grabbing [@media(pointer:coarse)]:cursor-auto',
                      draggedProjectRole?.id === role.id && 'opacity-50',
                      role.id === addedRole?.id && styles.addedRole,
                    )}
                  >
                    <button
                      type="button"
                      ref={role.id === addedRole?.id ? addedRoleButton : undefined}
                      aria-label={`Настроить роль «${role.name}»`}
                      aria-describedby={`${id}-members-${role.id}`}
                      aria-haspopup="dialog"
                      title="Настроить роль и участников"
                      disabled={disabled}
                      onClick={() => onEditRole(role)}
                      className="flex min-h-14 min-w-0 flex-1 items-center gap-3 rounded-lg py-2 pl-2 pr-1 text-left text-sm focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                    >
                      <RoleMark name={role.name} color={role.color} />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-pretty font-medium leading-5">{role.name}</span>
                        <span id={`${id}-members-${role.id}`} className="mt-0.5 block text-xs text-muted-foreground">
                          {memberCount(role)}
                        </span>
                      </span>
                    </button>
                    {role.azureEstimateField && <span className="mr-3 flex shrink-0"><InfoHint text="Роль загружена из Azure DevOps" /></span>}
                  </li>
                ))}
              </ul>
            ) : (
              <>
                {showDropSlot && <div aria-hidden="true" className="mb-2 flex [@media(pointer:coarse)]:hidden">{dropSlot}</div>}
                <p role="status" className="px-2 py-4 text-center text-sm text-muted-foreground">{roles.length ? 'Роли не найдены.' : 'В проекте пока нет ролей.'}</p>
              </>
            )}
          </div>
      </section>
    </div>
  );
}
