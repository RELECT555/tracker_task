'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowUpCircle,
  Ban,
  Check,
  FileText,
  GitBranch,
  History,
  Loader2,
  MessageCircleQuestion,
  MessageSquare,
  Send,
  Settings2,
  X,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { requestApi } from '@/entities/request/api/requestApi';
import { RequestStatusBadge } from '@/entities/request/ui/RequestStatusBadge';
import {
  getAvailableActions,
  useRequestActions,
} from '@/features/request-actions/model/useRequestActions';
import { FieldSchemaForm } from '@/features/request-fields/ui/FieldSchemaForm';
import { RequestFieldsView } from '@/features/request-fields/ui/RequestFieldsView';
import { validateFieldSchema } from '@/entities/request-type/model/field-schema';
import { queryKeys } from '@/shared/api/queryKeys';
import { routes } from '@/shared/config/routes';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardTitle } from '@/shared/ui/card';
import { DetailSection, MetaItem } from '@/shared/ui/detail-section';
import { Label } from '@/shared/ui/label';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';
import { RouteTimeline } from '@/widgets/route-timeline/RouteTimeline';
import { RequestComments } from '@/widgets/request-comments/RequestComments';
import { RequestHistoryTimeline } from '@/widgets/request-history/RequestHistoryTimeline';

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

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: queryKeys.requests.detail(requestId),
    queryFn: () => requestApi.getById(requestId),
  });

  const actions = useRequestActions(requestId);
  const can = getAvailableActions(data);
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

  const openProvideInfoForm = () => {
    setProvideFields({ ...(data?.fields ?? {}) });
    setProvideFieldsJson(JSON.stringify(data?.fields ?? {}, null, 2));
    setShowProvideInfoForm(true);
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
    <DashboardShell title={data?.title ?? 'Запрос'} containerClassName="max-w-screen-2xl">
      <Link
        href={routes.outbox}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Назад к исходящим
      </Link>

      {isLoading && <p className="mt-6 text-muted-foreground">Загрузка...</p>}
      {loadError && (
        <Alert variant="destructive" className="mt-6">
          <AlertDescription>{(loadError as Error).message}</AlertDescription>
        </Alert>
      )}

      {data && (
        <div className="mt-6 space-y-5">
          <Card className="overflow-hidden">
            <div className="px-6 py-5">
              <div className="flex flex-wrap items-center gap-2">
                <RequestStatusBadge status={data.status} />
                {data.type ? (
                  <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                    {data.type.name}
                  </span>
                ) : null}
              </div>
              <CardTitle className="mt-3 text-2xl">{data.title}</CardTitle>

              <dl className="mt-4 grid gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
                <MetaItem label="Автор" value={data.author.fullName} />
                <MetaItem
                  label="Создан"
                  value={new Date(data.createdAt).toLocaleString('ru-RU')}
                />
                {data.submittedAt ? (
                  <MetaItem
                    label="Отправлен"
                    value={new Date(data.submittedAt).toLocaleString('ru-RU')}
                  />
                ) : null}
              </dl>
            </div>

            {data.status === 'pending_info' ? (
              <CardContent className="border-t border-border/60 bg-muted/20 px-6 py-4 dark:bg-muted/10">
                <Alert>
                  <AlertDescription>
                    Ожидается уточнение от автора запроса. После ответа согласование продолжится.
                  </AlertDescription>
                </Alert>
              </CardContent>
            ) : null}
          </Card>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start xl:grid-cols-[minmax(0,1.15fr)_400px] xl:gap-6">
            <Card className="divide-y divide-border/60 overflow-hidden">
              <DetailSection title="Поля запроса" icon={FileText}>
                <RequestFieldsView
                  fields={data.fields}
                  schema={data.type?.fieldSchema ?? []}
                />
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
                      <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
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
            </Card>

            {showSidebar ? (
              <Card className="divide-y divide-border/60 overflow-hidden lg:sticky lg:top-6">
                {data.route ? (
                  <DetailSection title="Маршрут согласования" icon={GitBranch}>
                    <RouteTimeline embedded route={data.route} />
                  </DetailSection>
                ) : null}

                {hasActions ? (
                  <DetailSection title="Действия" icon={Settings2}>
                    <div className="space-y-4">
                      {error ? (
                        <Alert variant="destructive">
                          <AlertDescription>{error}</AlertDescription>
                        </Alert>
                      ) : null}

                      <div className="flex flex-col gap-2">
                      {can.submit && (
                        <Button
                          className="w-full justify-start"
                          onClick={() => actions.submit.mutate(undefined, { onSuccess, onError })}
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
                      <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
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
                    </div>
                  </DetailSection>
                ) : null}
              </Card>
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
  const borderClass =
    variant === 'destructive'
      ? 'border-destructive/30 bg-destructive/5 dark:bg-destructive/10'
      : 'border-border/70 bg-muted/40 dark:bg-accent/20';

  return (
    <div className={`space-y-3 rounded-lg border p-4 ${borderClass}`}>
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
