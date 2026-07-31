'use client';

import { useQuery } from '@tanstack/react-query';
import {
  ArrowUpCircle,
  Ban,
  Check,
  FileText,
  GitBranch,
  History,
  Loader2,
  MessageCircleQuestion,
  MessageSquare,
  Paperclip,
  Pencil,
  Send,
  Settings2,
  X,
} from 'lucide-react';
import { useState, type ReactNode, useEffect } from 'react';
import {
  PRIORITY_LABELS,
  REQUEST_PRIORITIES,
  type RequestPriority,
} from '@tracker/shared';
import { requestApi } from '@/entities/request/api/requestApi';
import { RequestPriorityBadge } from '@/entities/request/ui/RequestPriorityBadge';
import { RequestStatusBadge } from '@/entities/request/ui/RequestStatusBadge';
import {
  createDefaultPersonalSteps,
  PersonalRouteBuilder,
  validatePersonalRouteSteps,
  type PersonalRouteStepForm,
} from '@/features/build-personal-route/ui/PersonalRouteBuilder';
import {
  getAvailableActions,
  useRequestActions,
} from '@/features/request-actions/model/useRequestActions';
import { useAuth } from '@/features/auth/model/useAuth';
import { FieldSchemaForm } from '@/features/request-fields/ui/FieldSchemaForm';
import { RequestFieldsView } from '@/features/request-fields/ui/RequestFieldsView';
import { validateFieldSchema } from '@/entities/request-type/model/field-schema';
import { queryKeys } from '@/shared/api/queryKeys';
import { routes } from '@/shared/config/routes';
import { PageBreadcrumbs } from '@/shared/ui/page-breadcrumbs';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { DetailSection, MetaItem } from '@/shared/ui/detail-section';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';
import { RouteTimeline } from '@/widgets/route-timeline/RouteTimeline';
import { RequestAttachments } from '@/widgets/request-attachments/RequestAttachments';
import { RequestComments } from '@/widgets/request-comments/RequestComments';
import { RequestHistoryTimeline } from '@/widgets/request-history/RequestHistoryTimeline';

type SubmitRouteMode = 'default' | 'personal';

export function RequestDetailPage({ requestId }: { requestId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');
  const [showRequestInfoForm, setShowRequestInfoForm] = useState(false);
  const [provideFields, setProvideFields] = useState<Record<string, unknown>>({});
  const [provideFieldsJson, setProvideFieldsJson] = useState('');
  const [provideComment, setProvideComment] = useState('');
  const [showProvideInfoForm, setShowProvideInfoForm] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');
  const [showEscalateForm, setShowEscalateForm] = useState(false);
  const [showDraftEdit, setShowDraftEdit] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editPriority, setEditPriority] = useState<RequestPriority>('normal');
  const [editFields, setEditFields] = useState<Record<string, unknown>>({});
  const [submitRouteMode, setSubmitRouteMode] = useState<SubmitRouteMode>('default');
  const [personalSteps, setPersonalSteps] = useState<PersonalRouteStepForm[]>([]);

  const { user } = useAuth();
  const { data, isLoading, error: loadError } = useQuery({
    queryKey: queryKeys.requests.detail(requestId),
    queryFn: () => requestApi.getById(requestId),
  });

  const actions = useRequestActions(requestId);
  const can = getAvailableActions(data);
  const allowsPersonalRoute = Boolean(data?.type?.allowsPersonalRoute);
  const hasDefaultRoute = Boolean(data?.type?.defaultRouteTemplateId);
  const maxPersonalSteps = data?.type?.maxPersonalRouteSteps ?? 5;

  useEffect(() => {
    if (!data?.type) return;
    if (data.type.allowsPersonalRoute && !data.type.defaultRouteTemplateId) {
      setSubmitRouteMode('personal');
    } else {
      setSubmitRouteMode('default');
    }
    setPersonalSteps(createDefaultPersonalSteps(user));
  }, [data?.type?.id, data?.type?.allowsPersonalRoute, data?.type?.defaultRouteTemplateId, user]);

  const hasActions =
    can.submit ||
    can.approve ||
    can.reject ||
    can.request_info ||
    can.provide_info ||
    can.escalate ||
    can.cancel;

  const onError = (err: Error) => setError(err.message);
  const onSuccess = () => setError(null);

  const handleSubmit = () => {
    setError(null);

    if (allowsPersonalRoute && submitRouteMode === 'personal') {
      const validationError = validatePersonalRouteSteps(
        personalSteps,
        maxPersonalSteps,
        user?.id,
      );
      if (validationError) {
        setError(validationError);
        return;
      }

      actions.submit.mutate(
        {
          personalSteps: personalSteps.map((step) => ({
            name: step.name.trim(),
            assigneeUserId: step.assigneeUserId,
            slaHours: step.slaHours,
          })),
        },
        { onSuccess, onError },
      );
      return;
    }

    actions.submit.mutate(undefined, { onSuccess, onError });
  };

  const openProvideInfoForm = () => {
    setProvideFields({ ...(data?.fields ?? {}) });
    setProvideFieldsJson(JSON.stringify(data?.fields ?? {}, null, 2));
    setShowProvideInfoForm(true);
  };

  const openDraftEdit = () => {
    setEditTitle(data?.title ?? '');
    setEditPriority(data?.priority ?? 'normal');
    setEditFields({ ...(data?.fields ?? {}) });
    setShowDraftEdit(true);
    setError(null);
  };

  const handleSaveDraft = () => {
    setError(null);

    if (!editTitle.trim()) {
      setError('Укажите название запроса');
      return;
    }

    const validationError = validateFieldSchema(fieldSchema, editFields);
    if (validationError) {
      setError(validationError);
      return;
    }

    actions.update.mutate(
      { title: editTitle.trim(), fields: editFields, priority: editPriority },
      {
        onSuccess: () => {
          onSuccess();
          setShowDraftEdit(false);
        },
        onError,
      },
    );
  };

  const fieldSchema = data?.type?.fieldSchema ?? [];

  const handleProvideInfo = () => {
    setError(null);

    if (fieldSchema.length > 0) {
      const validationError = validateFieldSchema(fieldSchema, provideFields);
      if (validationError) {
        setError(validationError);
        return;
      }

      actions.provideInfo.mutate(
        { fields: provideFields, comment: provideComment.trim() || undefined },
        {
          onSuccess: () => {
            onSuccess();
            setProvideComment('');
            setShowProvideInfoForm(false);
          },
          onError,
        },
      );
      return;
    }

    try {
      const fields = provideFieldsJson.trim()
        ? (JSON.parse(provideFieldsJson) as Record<string, unknown>)
        : undefined;
      actions.provideInfo.mutate(
        { fields, comment: provideComment.trim() || undefined },
        {
          onSuccess: () => {
            onSuccess();
            setProvideComment('');
            setShowProvideInfoForm(false);
          },
          onError,
        },
      );
    } catch {
      setError('Некорректный JSON в полях запроса');
    }
  };

  const transitions = data?.transitions ?? [];
  const showHistory = transitions.length > 0;
  const showComments =
    data?.commentPermissions.canComment || (data?.comments.length ?? 0) > 0;
  const showSidebar = Boolean(data?.route) || hasActions;

  return (
    <DashboardShell
      title="Запрос"
      titleAs="p"
      containerClassName="max-w-screen-2xl"
    >
      <PageBreadcrumbs
        items={[
          { label: 'Исходящие', href: routes.outbox },
          { label: data?.title ?? 'Запрос' },
        ]}
      />

      {isLoading && <p className="mt-6 text-muted-foreground">Загрузка...</p>}
      {loadError && (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{(loadError as Error).message}</AlertDescription>
        </Alert>
      )}

      {data && (
        <div className="mt-6 space-y-5">
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.04),0_4px_12px_hsl(var(--foreground)/0.05)] dark:shadow-none">
            <div className="px-6 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <RequestStatusBadge status={data.status} />
                <RequestPriorityBadge priority={data.priority} alwaysShow />
                {data.type ? (
                  <span className="rounded-md bg-muted/50 px-2 py-0.5 font-mono text-xs font-medium text-muted-foreground">
                    {data.type.name}
                  </span>
                ) : null}
              </div>
              <h1 className="mt-3 text-2xl font-semibold tracking-tight">{data.title}</h1>

              <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetaItem label="Автор" value={data.author.fullName} />
                <MetaItem
                  label="Создан"
                  value={new Date(data.createdAt).toLocaleString('ru-RU')}
                  mono
                />
                {data.submittedAt ? (
                  <MetaItem
                    label="Отправлен"
                    value={new Date(data.submittedAt).toLocaleString('ru-RU')}
                    mono
                  />
                ) : null}
              </dl>
            </div>

            {data.status === 'pending_info' ? (
              <div className="border-t border-border px-6 py-4">
                <Alert>
                  <AlertDescription>
                    Ожидается уточнение от автора запроса. После ответа согласование продолжится.
                  </AlertDescription>
                </Alert>
              </div>
            ) : null}
          </section>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start xl:grid-cols-[minmax(0,1.15fr)_400px] xl:gap-6">
            <div className="space-y-4">
              <DetailSection title="Поля запроса" icon={FileText}>
                {showDraftEdit ? (
                  <div className="space-y-4">
                    {error ? (
                      <Alert variant="destructive">
                        <AlertDescription>{error}</AlertDescription>
                      </Alert>
                    ) : null}
                    <div className="space-y-2">
                      <Label htmlFor="draft-title">Название</Label>
                      <Input
                        id="draft-title"
                        value={editTitle}
                        onChange={(event) => setEditTitle(event.target.value)}
                        maxLength={500}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="draft-priority">Приоритет</Label>
                      <Select
                        value={editPriority}
                        onValueChange={(value) => setEditPriority(value as RequestPriority)}
                      >
                        <SelectTrigger id="draft-priority" className="bg-field">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {REQUEST_PRIORITIES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {PRIORITY_LABELS[value]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {fieldSchema.length > 0 ? (
                      <FieldSchemaForm
                        schema={fieldSchema}
                        values={editFields}
                        onChange={setEditFields}
                      />
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Button
                        onClick={handleSaveDraft}
                        disabled={actions.update.isPending}
                      >
                        {actions.update.isPending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : null}
                        Сохранить
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => setShowDraftEdit(false)}
                        disabled={actions.update.isPending}
                      >
                        Отмена
                      </Button>
                    </div>
                  </div>
                ) : (
                  <RequestFieldsView
                    fields={data.fields}
                    schema={data.type?.fieldSchema ?? []}
                  />
                )}
              </DetailSection>

              {showHistory ? (
                <DetailSection title="История изменений" icon={History}>
                  <RequestHistoryTimeline embedded transitions={transitions} />
                </DetailSection>
              ) : null}

              {showComments ? (
                <DetailSection
                  title="Комментарии"
                  icon={MessageSquare}
                  badge={
                    data.comments.length > 0 ? (
                      <span className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-xs font-medium text-primary">
                        {data.comments.length}
                      </span>
                    ) : null
                  }
                >
                  <RequestComments
                    embedded
                    requestId={requestId}
                    comments={data.comments}
                    permissions={data.commentPermissions}
                  />
                </DetailSection>
              ) : null}

              <DetailSection title="Вложения" icon={Paperclip}>
                <RequestAttachments embedded />
              </DetailSection>
            </div>

            {showSidebar ? (
              <div className="space-y-4 lg:sticky lg:top-6">
                {data.route ? (
                  <DetailSection title="Маршрут согласования" icon={GitBranch}>
                    <RouteTimeline embedded route={data.route} />
                  </DetailSection>
                ) : null}

                {hasActions ? (
                  <DetailSection title="Действия" icon={Settings2} bodyClassName="space-y-4">
                      {error ? (
                        <Alert variant="destructive">
                          <AlertDescription>{error}</AlertDescription>
                        </Alert>
                      ) : null}

                      <div className="flex flex-col gap-2">
                      {can.submit && !showDraftEdit && (
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                          onClick={openDraftEdit}
                        >
                          <Pencil className="h-4 w-4" />
                          Редактировать черновик
                        </Button>
                      )}
                      {can.submit && allowsPersonalRoute ? (
                        <div className="space-y-3 rounded-lg border border-border/70 bg-muted/10 p-3">
                          {hasDefaultRoute ? (
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground">
                                Как отправить на согласование
                              </Label>
                              <div className="space-y-2">
                                <label className="flex cursor-pointer items-start gap-2 text-sm">
                                  <input
                                    type="radio"
                                    name="submit-route-mode"
                                    checked={submitRouteMode === 'default'}
                                    onChange={() => setSubmitRouteMode('default')}
                                    className="mt-0.5 h-4 w-4"
                                  />
                                  <span>
                                    <span className="font-medium">Стандартный маршрут</span>
                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                      По шаблону типа запроса
                                    </span>
                                  </span>
                                </label>
                                <label className="flex cursor-pointer items-start gap-2 text-sm">
                                  <input
                                    type="radio"
                                    name="submit-route-mode"
                                    checked={submitRouteMode === 'personal'}
                                    onChange={() => setSubmitRouteMode('personal')}
                                    className="mt-0.5 h-4 w-4"
                                  />
                                  <span>
                                    <span className="font-medium">Собрать свой маршрут</span>
                                    <span className="mt-0.5 block text-xs text-muted-foreground">
                                      Сами выберите согласующих
                                    </span>
                                  </span>
                                </label>
                              </div>
                            </div>
                          ) : null}

                          {submitRouteMode === 'personal' || !hasDefaultRoute ? (
                            <PersonalRouteBuilder
                              steps={personalSteps}
                              onChange={setPersonalSteps}
                              maxSteps={maxPersonalSteps}
                              currentUser={user}
                            />
                          ) : null}
                        </div>
                      ) : null}
                      {can.submit && (
                        <Button
                          className="w-full justify-start"
                          onClick={handleSubmit}
                          disabled={actions.submit.isPending}
                        >
                          {actions.submit.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Send className="h-4 w-4" />
                          )}
                          Отправить на согласование
                        </Button>
                      )}
                      {can.approve && (
                        <Button
                          className="w-full justify-start"
                          onClick={() => actions.approve.mutate(undefined, { onSuccess, onError })}
                          disabled={actions.approve.isPending}
                        >
                          {actions.approve.isPending ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Check className="h-4 w-4" />
                          )}
                          Согласовать
                        </Button>
                      )}
                      {can.reject && !showRejectForm && (
                        <Button
                          variant="destructive"
                          className="w-full justify-start"
                          onClick={() => setShowRejectForm(true)}
                        >
                          <X className="h-4 w-4" />
                          Отклонить
                        </Button>
                      )}
                      {can.request_info && !showRequestInfoForm && (
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => setShowRequestInfoForm(true)}
                        >
                          <MessageCircleQuestion className="h-4 w-4" />
                          Запросить уточнение
                        </Button>
                      )}
                      {can.escalate && !showEscalateForm && (
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => setShowEscalateForm(true)}
                        >
                          <ArrowUpCircle className="h-4 w-4" />
                          Эскалировать
                        </Button>
                      )}
                      {can.provide_info && !showProvideInfoForm && (
                        <Button className="w-full justify-start" onClick={openProvideInfoForm}>
                          <MessageCircleQuestion className="h-4 w-4" />
                          Ответить на уточнение
                        </Button>
                      )}
                      {can.cancel && !showCancelForm && (
                        <Button
                          variant="outline"
                          className="w-full justify-start"
                          onClick={() => setShowCancelForm(true)}
                        >
                          <Ban className="h-4 w-4" />
                          Отменить запрос
                        </Button>
                      )}
                    </div>

                    {showEscalateForm && can.escalate && (
                      <ActionForm
                        id="escalate-reason"
                        label="Причина эскалации"
                        value={escalateReason}
                        onChange={setEscalateReason}
                        placeholder="Например: требуется решение вышестоящего руководителя..."
                        onClose={() => {
                          setShowEscalateForm(false);
                          setEscalateReason('');
                        }}
                        onConfirm={() =>
                          actions.escalate.mutate(escalateReason.trim(), {
                            onSuccess: () => {
                              onSuccess();
                              setEscalateReason('');
                              setShowEscalateForm(false);
                            },
                            onError,
                          })
                        }
                        confirmLabel="Эскалировать"
                        confirmIcon={<ArrowUpCircle className="h-4 w-4" />}
                        isPending={actions.escalate.isPending}
                        required
                      />
                    )}

                    {showRequestInfoForm && can.request_info && (
                      <ActionForm
                        id="info-message"
                        label="Что нужно уточнить?"
                        value={infoMessage}
                        onChange={setInfoMessage}
                        placeholder="Например: уточните даты командировки..."
                        onClose={() => {
                          setShowRequestInfoForm(false);
                          setInfoMessage('');
                        }}
                        onConfirm={() =>
                          actions.requestInfo.mutate(infoMessage.trim(), {
                            onSuccess: () => {
                              onSuccess();
                              setInfoMessage('');
                              setShowRequestInfoForm(false);
                            },
                            onError,
                          })
                        }
                        confirmLabel="Отправить запрос"
                        confirmIcon={<MessageCircleQuestion className="h-4 w-4" />}
                        isPending={actions.requestInfo.isPending}
                        required
                      />
                    )}

                    {showProvideInfoForm && can.provide_info && (
                      <div className="mt-4 space-y-3 border-t border-primary/30 pt-4">
                        {fieldSchema.length > 0 ? (
                          <FieldSchemaForm
                            schema={fieldSchema}
                            values={provideFields}
                            onChange={setProvideFields}
                            idPrefix="provide"
                          />
                        ) : (
                          <>
                            <Label htmlFor="provide-fields">Обновлённые поля (JSON)</Label>
                            <textarea
                              id="provide-fields"
                              value={provideFieldsJson}
                              onChange={(e) => setProvideFieldsJson(e.target.value)}
                              rows={6}
                              className="flex min-h-[120px] w-full rounded-md border border-input bg-field px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                            />
                          </>
                        )}
                        <Label htmlFor="provide-comment">Комментарий (необязательно)</Label>
                        <textarea
                          id="provide-comment"
                          value={provideComment}
                          onChange={(e) => setProvideComment(e.target.value)}
                          rows={2}
                          className="flex min-h-[60px] w-full rounded-md border border-input bg-field px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                        />
                        <div className="flex gap-2">
                          <Button disabled={actions.provideInfo.isPending} onClick={handleProvideInfo}>
                            {actions.provideInfo.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Check className="h-4 w-4" />
                            )}
                            Отправить ответ
                          </Button>
                          <Button variant="outline" onClick={() => setShowProvideInfoForm(false)}>
                            Закрыть
                          </Button>
                        </div>
                      </div>
                    )}

                    {showRejectForm && can.reject && (
                      <ActionForm
                        id="reject-reason"
                        label="Причина отклонения"
                        value={rejectReason}
                        onChange={setRejectReason}
                        variant="destructive"
                        onClose={() => {
                          setShowRejectForm(false);
                          setRejectReason('');
                        }}
                        onConfirm={() =>
                          actions.reject.mutate(rejectReason.trim(), {
                            onSuccess: () => {
                              onSuccess();
                              setRejectReason('');
                              setShowRejectForm(false);
                            },
                            onError,
                          })
                        }
                        confirmLabel="Подтвердить отклонение"
                        confirmIcon={<X className="h-4 w-4" />}
                        isPending={actions.reject.isPending}
                        required
                      />
                    )}

                    {showCancelForm && can.cancel && (
                      <ActionForm
                        id="cancel-reason"
                        label="Причина отмены (необязательно)"
                        value={cancelReason}
                        onChange={setCancelReason}
                        onClose={() => {
                          setShowCancelForm(false);
                          setCancelReason('');
                        }}
                        onConfirm={() =>
                          actions.cancel.mutate(cancelReason.trim() || undefined, {
                            onSuccess: () => {
                              onSuccess();
                              setCancelReason('');
                              setShowCancelForm(false);
                            },
                            onError,
                          })
                        }
                        confirmLabel="Подтвердить отмену"
                        confirmIcon={<Ban className="h-4 w-4" />}
                        isPending={actions.cancel.isPending}
                      />
                    )}
                  </DetailSection>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </DashboardShell>
  );
}

function ActionForm({
  id,
  label,
  value,
  onChange,
  placeholder,
  onClose,
  onConfirm,
  confirmLabel,
  confirmIcon,
  isPending,
  required,
  variant,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  confirmIcon: ReactNode;
  isPending: boolean;
  required?: boolean;
  variant?: 'destructive';
}) {
  const accentClass =
    variant === 'destructive' ? 'border-destructive/40' : 'border-border';

  return (
    <div className={`mt-4 space-y-3 border-t pt-4 ${accentClass}`}>
      <Label htmlFor={id}>{label}</Label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        placeholder={placeholder}
        className="flex min-h-[80px] w-full rounded-md border border-input bg-field px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      />
      <div className="flex gap-2">
        <Button
          variant={variant === 'destructive' ? 'destructive' : 'default'}
          disabled={(required && !value.trim()) || isPending}
          onClick={onConfirm}
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : confirmIcon}
          {confirmLabel}
        </Button>
        <Button variant="outline" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </div>
  );
}
