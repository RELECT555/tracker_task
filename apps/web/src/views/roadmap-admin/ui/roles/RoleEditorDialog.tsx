import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { RefreshCw, X } from 'lucide-react';
import { roadmapApi, type RoadmapPerson, type RoadmapRole } from '@/entities/roadmap/api/roadmapApi';
import { routes } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import { RoleMark } from '@/shared/ui/color-mark';
import { ErrorNotice, QueryErrorNotice } from '@/shared/ui/error-notice';
import { normalizeRoleName } from '../../model/role-name';
import { initialRoleParticipation, parseRoleParticipation, type RoleMemberDraft } from '../../model/role-participation';
import { RoleMembersEditor } from './RoleMembersEditor';

type RoleDraft = { name: string; color: string; members: RoleMemberDraft[] };

const fieldClass = 'min-h-10 w-full min-w-0 rounded-lg border border-input bg-field px-3 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const labelClass = 'mb-1.5 block text-sm font-medium text-foreground';
const colorFieldClass = 'h-10 w-12 cursor-pointer rounded-lg border border-input bg-field p-1.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';
const defaultColor = '#6366f1';

function AzureRoleMark() {
  return (
    <span className="inline-flex shrink-0 items-center gap-1.5 text-xs font-medium text-primary" title="Роль из Azure DevOps">
      <RefreshCw aria-hidden="true" className="size-3.5" />
      <span>Azure DevOps</span>
    </span>
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
    members: initialRoleParticipation(role),
  };
  const form = { ...defaults, ...draft };
  const membersChanged = form.members.length !== defaults.members.length || form.members.some((member) => {
    const saved = defaults.members.find((item) => item.personExternalId === member.personExternalId);
    return !saved || member.allocationPercent !== saved.allocationPercent;
  });
  const dirty = form.name !== defaults.name || form.color !== defaults.color || membersChanged;
  const participation = parseRoleParticipation(form.members);
  const nameTaken = !role && roleNames.has(normalizeRoleName(form.name));
  const people = peopleQuery.data ?? [];
  const activePeople = people.filter((person) => person.isActive !== false);

  const save = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      const assignment = membersChanged || !role
        ? { memberAllocations: participation.allocations }
        : {};
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
  const canSave = !pending && participation.valid && Boolean(form.name.trim()) && !nameTaken && (!role || dirty);

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

          <RoleMembersEditor
            id={id}
            people={people}
            members={form.members}
            role={role}
            disabled={pending}
            pickerDisabled={peopleQuery.isLoading || (!peopleQuery.data && Boolean(peopleQuery.error))}
            portalContainer={dialog}
            onChange={(members) => setDraft((current) => ({ ...current, members }))}
          />
          {peopleQuery.isLoading && <p role="status" className="text-sm text-muted-foreground">Загружаем сотрудников…</p>}
          {!peopleQuery.isLoading && !peopleQuery.error && !activePeople.length && !form.members.length && (
            <Link className="inline-block rounded text-sm text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring" href={routes.roadmapAdminUsers}>Загрузить сотрудников</Link>
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
