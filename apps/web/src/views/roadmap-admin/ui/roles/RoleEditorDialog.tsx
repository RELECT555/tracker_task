import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { RefreshCw, Search, X } from 'lucide-react';
import { roadmapApi, type RoadmapPerson, type RoadmapRole } from '@/entities/roadmap/api/roadmapApi';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { RoleMark } from '@/shared/ui/color-mark';
import { ErrorNotice, QueryErrorNotice } from '@/shared/ui/error-notice';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { SearchableSelect } from '@/shared/ui/searchable-select';
import { normalizeRoleName } from '../../model/role-name';

type RoleDraft = { name: string; color: string; personId: string; memberIds: string[] };

const fieldClass = 'min-h-10 w-full min-w-0 rounded-lg border border-input bg-field px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const labelClass = 'mb-1.5 block text-sm font-medium text-foreground';
const colorFieldClass = 'h-10 w-12 cursor-pointer rounded-lg border border-input bg-field p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const noPersonValue = '__no_person__';
const defaultColor = '#6366f1';

function AzureRoleMark() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary" title="Роль из Azure DevOps">
      <RefreshCw aria-hidden="true" className="size-3.5" />
      <span>Azure DevOps</span>
    </span>
  );
}

function RoleMembersPicker({ people, memberIds, defaultPersonId, role, disabled, portalContainer, onChange }: {
  people: RoadmapPerson[];
  memberIds: string[];
  defaultPersonId: string;
  role?: RoadmapRole;
  disabled: boolean;
  portalContainer: HTMLElement | null;
  onChange: (memberIds: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const searchInput = useRef<HTMLInputElement>(null);
  const selected = new Set(memberIds);
  if (defaultPersonId) selected.add(defaultPersonId);
  const assignable = people.filter((person) => person.isActive !== false || selected.has(person.id));
  const term = search.trim().toLocaleLowerCase('ru-RU');
  const visible = open ? assignable.filter((person) => `${person.name} ${person.email ?? ''}`.toLocaleLowerCase('ru-RU').includes(term)) : [];
  const preview = [...selected].slice(0, 4).map((id) => ({
    id,
    name: people.find((person) => person.id === id)?.name
      ?? role?.members?.find((person) => person.personExternalId === id)?.personName
      ?? (id === defaultPersonId ? role?.defaultPersonName : null)
      ?? 'Сотрудник',
  }));

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) setSearch('');
  }

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <h3 className="text-sm font-medium">
          {selected.size ? <>Участники <span className="ml-1 font-normal tabular-nums text-muted-foreground">{selected.size}</span></>
            : <span className="font-normal text-muted-foreground">Участников нет</span>}
        </h3>
        <Popover open={open} onOpenChange={changeOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={disabled} className="-mr-2 px-2 text-primary">
              {selected.size ? 'Изменить состав' : 'Добавить участников'}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            portalContainer={portalContainer}
            aria-label="Выбор участников"
            align="end"
            sideOffset={6}
            collisionPadding={12}
            className="flex max-h-[var(--radix-popover-content-available-height)] w-[min(25rem,calc(100vw-1.5rem))] flex-col overflow-y-auto rounded-xl p-0"
            onOpenAutoFocus={(event) => { event.preventDefault(); searchInput.current?.focus(); }}
          >
            <div className="shrink-0 border-b border-border p-3">
              <label className="relative block">
                <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  ref={searchInput}
                  type="search"
                  aria-label="Поиск сотрудников"
                  placeholder="Найти по ФИО или почте"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className={cn(fieldClass, 'pl-9')}
                />
              </label>
            </div>
            <fieldset disabled={disabled} className="roadmap-scrollbar relative max-h-60 min-h-24 min-w-0 flex-1 overflow-auto p-1.5">
              <legend className="sr-only">Сотрудники</legend>
              <div className="space-y-0.5">
                {visible.length ? visible.map((person) => (
                  <label key={person.id} className="flex min-h-11 items-center gap-2.5 rounded-md px-2 py-1 text-sm hover:bg-muted">
                    <input
                      type="checkbox"
                      checked={selected.has(person.id)}
                      disabled={defaultPersonId === person.id}
                      onChange={(event) => onChange(event.target.checked
                        ? [...memberIds, person.id]
                        : memberIds.filter((id) => id !== person.id))}
                      className="size-4 shrink-0 accent-primary"
                    />
                    <span className="min-w-0 flex-1 break-words">
                      <span className="block">{person.name}</span>
                      {person.email && <span className="block text-xs text-muted-foreground">{person.email}</span>}
                    </span>
                    {defaultPersonId === person.id ? <span className="max-w-24 text-right text-xs text-muted-foreground">По умолчанию</span>
                      : person.isActive === false ? <span className="text-xs text-muted-foreground">Неактивен</span> : null}
                  </label>
                )) : <p role="status" className="px-2 py-3 text-sm text-muted-foreground">Сотрудники не найдены.</p>}
              </div>
            </fieldset>
            <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-2.5">
              <p className="text-xs text-muted-foreground">Выбрано: {selected.size}</p>
              <Button type="button" size="sm" onClick={() => changeOpen(false)}>Готово</Button>
            </div>
          </PopoverContent>
        </Popover>
      </div>
      {preview.length > 0 && (
        <ul aria-label="Выбранные участники" className="flex flex-wrap gap-1.5">
          {preview.map(({ id, name }) => <li key={id} className="max-w-full break-words rounded-md bg-muted px-2 py-1 text-xs">{name}</li>)}
          {selected.size > preview.length && <li className="px-1 py-1 text-xs text-muted-foreground">Ещё {selected.size - preview.length}</li>}
        </ul>
      )}
    </div>
  );
}

type RoleEditorDialogProps = {
  projectId: string;
  projectName: string;
  role?: RoadmapRole;
  roleNames: ReadonlySet<string>;
  peopleQuery: { data?: RoadmapPerson[]; error: Error | null; isLoading: boolean; isFetching: boolean; refetch: () => Promise<unknown> };
  onClose: () => void;
  onSaved: (message: string, roleName: string) => Promise<void>;
};

export function RoleEditorDialog({ projectId, projectName, role, roleNames, peopleQuery, onClose, onSaved }: RoleEditorDialogProps) {
  const id = useId();
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const keepEditingButton = useRef<HTMLButtonElement>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [draft, setDraft] = useState<Partial<RoleDraft>>({});
  const defaults: RoleDraft = {
    name: role?.name ?? '',
    color: role?.color ?? defaultColor,
    personId: role?.defaultPersonExternalId ?? '',
    memberIds: role?.members?.map((member) => member.personExternalId) ?? [],
  };
  const form = { ...defaults, ...draft };
  const dirty = form.name !== defaults.name || form.color !== defaults.color || form.personId !== defaults.personId
    || form.memberIds.length !== defaults.memberIds.length || form.memberIds.some((memberId) => !defaults.memberIds.includes(memberId));
  const nameTaken = !role && roleNames.has(normalizeRoleName(form.name));
  const people = peopleQuery.data ?? [];
  const activePeople = people.filter((person) => person.isActive !== false);
  const inactiveDefault = form.personId && !activePeople.some((person) => person.id === form.personId);
  const options = [
    ...(form.personId ? [{ value: noPersonValue, label: 'Снять назначение' }] : []),
    ...(inactiveDefault ? [{ value: form.personId, label: role?.defaultPersonName ?? 'Сотрудник', description: 'Неактивен' }] : []),
    ...activePeople.map((person) => ({ value: person.id, label: person.name, description: person.email, badge: person.isMock ? 'демо' : undefined })),
  ];

  const save = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      const defaultIsMember = form.personId && (defaults.memberIds.includes(form.personId) || activePeople.some((person) => person.id === form.personId));
      const assignment = {
        ...(form.personId !== defaults.personId && { personExternalId: form.personId || null }),
        ...(draft.memberIds && { personExternalIds: [...new Set([...form.memberIds, ...(defaultIsMember ? [form.personId] : [])])] }),
      };
      if (role) {
        await roadmapApi.updateRole(role.id, {
          ...(name !== role.name && { name }),
          ...(form.color !== role.color && { color: form.color }),
          ...assignment,
        });
      } else {
        await roadmapApi.createRoleTemplate(name, form.color, { projectId, ...assignment });
      }
      return name;
    },
    onSuccess: async (name) => {
      await onSaved(role ? 'Изменения сохранены.' : `Роль «${name}» создана.`, name);
      dialog?.close();
    },
  });
  const pending = save.isPending;
  const canSave = !pending && Boolean(form.name.trim()) && !nameTaken && (!role || dirty);

  useEffect(() => {
    if (!dialog || dialog.open) return;
    dialog.showModal();
    (role ? closeButton.current : nameInput.current)?.focus();
  }, [dialog, role]);

  useEffect(() => {
    if (confirmDiscard) keepEditingButton.current?.focus();
  }, [confirmDiscard]);

  function requestClose() {
    if (pending) return;
    if (dirty) setConfirmDiscard(true);
    else dialog?.close();
  }

  return (
    <dialog
      ref={setDialog}
      aria-labelledby={`${id}-title`}
      aria-busy={pending}
      onCancel={(event) => { event.preventDefault(); requestClose(); }}
      onClose={onClose}
      className="m-auto max-h-none w-[min(36rem,calc(100%-2rem))] overflow-visible rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50"
    >
      <form noValidate onSubmit={(event) => { event.preventDefault(); if (canSave && !confirmDiscard) save.mutate(); }} className="flex max-h-[calc(100dvh-2rem)] flex-col">
        <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            {role && <RoleMark name={role.name} color={form.color} />}
            <div className="min-w-0">
              <h2 id={`${id}-title`} className="wrap-anywhere text-lg font-semibold">{role ? `Настроить роль «${role.name}»` : 'Новая роль'}</h2>
              <p className="mt-0.5 wrap-anywhere text-xs text-muted-foreground">{projectName}</p>
            </div>
          </div>
          <Button ref={closeButton} type="button" variant="ghost" size="icon" aria-label="Закрыть настройки роли" disabled={pending} onClick={requestClose} className="-mr-1 size-9 shrink-0">
            <X aria-hidden="true" className="size-4" />
          </Button>
        </header>

        <div className="roadmap-scrollbar min-h-0 space-y-5 overflow-auto px-4 py-4 sm:px-5">
          <ErrorNotice title="Не удалось сохранить роль" errors={[save.error]} />
          <QueryErrorNotice title="Не удалось загрузить сотрудников" queries={[peopleQuery]} />
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <div className="min-w-32 flex-1">
              <label className={labelClass} htmlFor={`${id}-name`}>Название роли</label>
              <input ref={nameInput} id={`${id}-name`} value={form.name} maxLength={100} required disabled={pending} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} className={fieldClass} aria-invalid={nameTaken || undefined} aria-describedby={nameTaken ? `${id}-duplicate` : undefined} />
            </div>
            <div>
              <label className={labelClass} htmlFor={`${id}-color`}>Цвет</label>
              <input id={`${id}-color`} type="color" value={form.color} disabled={pending} onChange={(event) => setDraft((current) => ({ ...current, color: event.target.value }))} className={colorFieldClass} />
            </div>
            {nameTaken && <p id={`${id}-duplicate`} className="w-full text-sm text-destructive">Роль с таким названием уже есть.</p>}
          </div>

          <div className="border-t border-border pt-4">
            <label htmlFor={`${id}-person`} className={labelClass}>Сотрудник по умолчанию</label>
            <SearchableSelect
              id={`${id}-person`}
              ariaLabel="Сотрудник по умолчанию"
              value={form.personId}
              onChange={(value) => setDraft((current) => ({ ...current, personId: value === noPersonValue ? '' : value }))}
              options={options}
              disabled={pending || peopleQuery.isLoading || (!activePeople.length && !form.personId)}
              placeholder="Не назначен"
              searchPlaceholder="Найти по ФИО или почте"
              className="border-border bg-transparent shadow-none"
              portalContainer={dialog}
            />
          </div>

          {peopleQuery.isLoading ? <p role="status" className="text-sm text-muted-foreground">Загружаем сотрудников…</p>
            : (!peopleQuery.error || peopleQuery.data) && (
              !activePeople.length && !form.memberIds.length && !form.personId
                ? <Link className="inline-block rounded text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href={routes.roadmapAdminUsers}>Загрузить сотрудников</Link>
                : <RoleMembersPicker
                    people={people}
                    memberIds={form.memberIds}
                    defaultPersonId={form.personId}
                    role={role}
                    disabled={pending}
                    portalContainer={dialog}
                    onChange={(next) => setDraft((current) => ({ ...current, memberIds: next }))}
                  />
            )}
          {role?.azureEstimateField && <AzureRoleMark />}
        </div>

        <footer className="shrink-0 border-t border-border px-4 py-3 sm:px-5">
          {confirmDiscard ? (
            <div role="group" aria-labelledby={`${id}-discard`} className="space-y-2">
              <p id={`${id}-discard`} className="text-sm font-medium">Закрыть без сохранения изменений?</p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button ref={keepEditingButton} type="button" variant="ghost" onClick={() => { setConfirmDiscard(false); closeButton.current?.focus(); }}>Продолжить редактирование</Button>
                <Button type="button" variant="outline" onClick={() => dialog?.close()}>Не сохранять</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="ghost" disabled={pending} onClick={requestClose}>Отмена</Button>
              <Button type="submit" disabled={!canSave}>{pending ? 'Сохраняем…' : role ? 'Сохранить' : 'Создать роль'}</Button>
            </div>
          )}
        </footer>
      </form>
    </dialog>
  );
}
