'use client';

import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, ExternalLink, Layers2, LoaderCircle, Minus, X } from 'lucide-react';
import { roadmapApi, type CreatedAzureWorkItem, type CreateAzureWorkItemInput, type RoadmapPerson, type RoadmapProjectsResult, type RoadmapWorkItem } from '@/entities/roadmap/api/roadmapApi';
import { RoadmapPersonAvatar } from '@/entities/roadmap/ui/RoadmapPersonAvatar';
import { Button, buttonVariants } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { SearchableSelect } from '@/shared/ui/searchable-select';

type Draft = Omit<CreateAzureWorkItemInput, 'requestId'>;
const typeOptions = [
  { value: 'Epic', label: 'Epic' },
  { value: 'Feature', label: 'Feature' },
  { value: 'Task', label: 'Task' },
] satisfies { value: Draft['type']; label: string }[];
const noSelectionIcon = <Minus aria-hidden="true" className="size-4" />;

async function requestStorageKey(externalProjectId: string, draft: Draft) {
  const data = new TextEncoder().encode(JSON.stringify([externalProjectId, draft]));
  const digest = await crypto.subtle.digest('SHA-256', data);
  const key = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `roadmap-azure-create:${key}`;
}

export function CreateAzureWorkItem({ externalProjectId, projectName, items, people, initialType, parentExternalId, onCreated, onClose }: {
  externalProjectId: string;
  projectName: string;
  items: RoadmapWorkItem[];
  people: RoadmapPerson[];
  initialType: 'Epic' | 'Feature';
  parentExternalId?: string;
  onCreated: (item: CreatedAzureWorkItem, parentExternalId?: string) => void;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const id = useId();
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const titleField = useRef<HTMLInputElement>(null);
  const resultLink = useRef<HTMLAnchorElement>(null);
  const submitting = useRef(false);
  const attempt = useRef<{ key: string; id: string } | null>(null);
  const [draft, setDraft] = useState<Draft>(() => ({ type: initialType, title: '', parentExternalId }));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [invalidTitle, setInvalidTitle] = useState(false);
  const [result, setResult] = useState<CreatedAzureWorkItem>();
  const parents = items.filter((item) => {
    const type = item.type.toLowerCase();
    return item.state !== 'Deleted' && (type === 'epic' || (draft.type === 'Task' && type === 'feature'));
  });
  const assignees = people.filter((person) => person.isActive !== false && !person.isMock && person.email);
  const isFeature = draft.type === 'Feature';

  useEffect(() => {
    if (!dialog) return;
    dialog.showModal();
    titleField.current?.focus();
  }, [dialog]);

  useEffect(() => {
    if (result) resultLink.current?.focus();
  }, [result]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const title = draft.title.trim();
    if (!title) {
      setInvalidTitle(true);
      titleField.current?.focus();
      return;
    }
    submitting.current = true;
    setPending(true);
    setError('');

    const payload: Draft = {
      type: draft.type,
      title,
      description: draft.description?.trim() || undefined,
      parentExternalId: draft.type !== 'Epic' ? draft.parentExternalId || undefined : undefined,
      personExternalId: draft.type !== 'Epic' ? draft.personExternalId || undefined : undefined,
    };

    try {
      const key = await requestStorageKey(externalProjectId, payload);
      let requestId = attempt.current?.key === key ? attempt.current.id : crypto.randomUUID();
      try {
        requestId = sessionStorage.getItem(key) ?? requestId;
        sessionStorage.setItem(key, requestId);
      } catch {
        // The in-memory key still covers retries in this form.
      }
      attempt.current = { key, id: requestId };
      const created = await roadmapApi.createWorkItem(externalProjectId, { ...payload, requestId });
      attempt.current = null;
      try { sessionStorage.removeItem(key); } catch { /* Storage may be disabled. */ }
      setResult(created);
      onCreated(created, payload.parentExternalId);
      client.setQueryData<RoadmapProjectsResult>(['roadmap', 'azure-projects'], (previous) => previous && ({
        ...previous,
        data: previous.data.map((project) => project.id === externalProjectId
          ? { ...project, imported: true, roadmapId: created.projectId }
          : project),
      }));
      void client.invalidateQueries({ queryKey: ['roadmap', 'plan', created.projectId] });
      void client.invalidateQueries({ queryKey: ['roadmap', 'azure-projects'] });
      void client.invalidateQueries({ queryKey: ['roadmap', 'local-projects'] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось создать карточку.');
    } finally {
      submitting.current = false;
      setPending(false);
    }
  }

  return (
      <dialog
        ref={setDialog}
        aria-labelledby={`${id}-heading`}
        onCancel={(event) => { if (submitting.current) event.preventDefault(); }}
        onClose={onClose}
        className="m-auto max-h-none w-[min(32rem,calc(100vw-2rem))] overflow-visible rounded-xl border border-border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50"
      >
        <div className="max-h-[calc(100dvh-2rem-2px)] overflow-y-auto overscroll-contain rounded-[inherit]">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 id={`${id}-heading`} className="text-base font-semibold">{draft.type === 'Epic' ? 'Создать эпик' : isFeature ? 'Создать фичу' : 'Создать задачу'}</h2>
              <p className="mt-1 text-sm text-muted-foreground wrap-anywhere">{projectName}</p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="-mr-2 -mt-1 size-8 shrink-0" aria-label="Закрыть" disabled={pending} onClick={() => dialog?.close()}>
              <X aria-hidden="true" className="size-4" />
            </Button>
          </div>
          {result ? (
            <div className="space-y-4 p-5">
              <div role="status" className="flex items-start gap-2 text-sm">
                <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                <div className="min-w-0">
                  <p className="font-medium">{result.type} №{result.externalId} создан</p>
                  <p className="mt-1 break-words text-muted-foreground">{result.title}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <a ref={resultLink} href={result.url} target="_blank" rel="noreferrer" className={buttonVariants({ variant: 'default', className: 'h-auto min-h-10 max-w-full text-center' })}>
                  <span className="min-w-0 whitespace-normal">Открыть карточку №{result.externalId} в Azure DevOps</span>
                  <ExternalLink aria-hidden="true" className="size-4 shrink-0" />
                </a>
                <Button type="button" variant="outline" onClick={() => dialog?.close()}>К плану</Button>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} noValidate aria-busy={pending} className="space-y-4 p-5">
              <fieldset disabled={pending} className="min-w-0 space-y-4">
                <div className="grid gap-4 sm:grid-cols-[8rem_minmax(0,1fr)]">
                  <div className="space-y-1.5">
                    <Label htmlFor={`${id}-type`}>Тип</Label>
                    <SearchableSelect
                      id={`${id}-type`}
                      value={draft.type}
                      options={typeOptions}
                      onChange={(value) => {
                        const type = value as Draft['type'];
                        setDraft((old) => old.type === type ? old : { ...old, type, parentExternalId: undefined });
                      }}
                      searchable={false}
                      disabled={pending}
                      portalContainer={dialog}
                      className="rounded-md"
                    />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <Label htmlFor={`${id}-title`}>Название</Label>
                    <Input
                      id={`${id}-title`}
                      ref={titleField}
                      value={draft.title}
                      onChange={(event) => {
                        setDraft((old) => ({ ...old, title: event.target.value }));
                        setInvalidTitle(false);
                      }}
                      required
                      maxLength={255}
                      aria-invalid={invalidTitle || undefined}
                      aria-describedby={invalidTitle ? `${id}-title-error` : undefined}
                    />
                    {invalidTitle && <p id={`${id}-title-error`} role="alert" className="text-sm text-destructive">Введите название.</p>}
                  </div>
                </div>
                {draft.type !== 'Epic' && <div className="space-y-1.5">
                  <Label htmlFor={`${id}-parent`}>{isFeature ? 'Родительский Epic' : 'Родительская карточка'}</Label>
                  <SearchableSelect
                    id={`${id}-parent`}
                    value={draft.parentExternalId ?? ''}
                    options={[
                      { value: '', label: isFeature ? 'Без Epic' : 'Без родительской карточки', leading: noSelectionIcon },
                      ...parents.map((item) => ({
                        value: item.externalId,
                        label: item.title,
                        description: `#${item.externalId} · ${item.type}`,
                        leading: <Layers2 aria-hidden="true" className="size-4" />,
                      })),
                    ]}
                    searchPlaceholder={isFeature ? 'Поиск Epic по названию или номеру' : 'Поиск карточки по названию или номеру'}
                    onChange={(value) => setDraft((old) => ({ ...old, parentExternalId: value }))}
                    disabled={pending}
                    portalContainer={dialog}
                    className="rounded-md"
                  />
                </div>}
                {draft.type !== 'Epic' && assignees.length > 0 && <div className="space-y-1.5">
                  <Label htmlFor={`${id}-person`}>Исполнитель</Label>
                  <SearchableSelect
                    id={`${id}-person`}
                    value={draft.personExternalId ?? ''}
                    options={[
                      { value: '', label: 'Без исполнителя', leading: noSelectionIcon },
                      ...assignees.map((person) => ({
                        value: person.id,
                        label: person.name,
                        description: person.email,
                        leading: <RoadmapPersonAvatar key={person.id} person={person} className="size-full rounded-[inherit] text-[10px] sm:size-full" />,
                      })),
                    ]}
                    searchPlaceholder="Поиск по имени или email"
                    onChange={(value) => setDraft((old) => ({ ...old, personExternalId: value }))}
                    disabled={pending}
                    portalContainer={dialog}
                    className="rounded-md"
                  />
                </div>}
                <div className="space-y-1.5">
                  <Label htmlFor={`${id}-description`}>Описание</Label>
                  <textarea id={`${id}-description`} rows={3} maxLength={4000} value={draft.description ?? ''} onChange={(event) => setDraft((old) => ({ ...old, description: event.target.value }))} className="w-full min-h-10 rounded-md border border-input bg-field px-3 py-2 text-sm text-foreground focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50" />
                </div>
              </fieldset>
              {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}
              <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
                <Button type="button" variant="outline" disabled={pending} onClick={() => dialog?.close()}>Отмена</Button>
                <Button type="submit" disabled={pending}>
                  {pending ? <LoaderCircle aria-hidden="true" className="size-4 motion-safe:animate-spin" /> : null}
                  {pending ? 'Создаём…' : 'Создать'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </dialog>
  );
}
