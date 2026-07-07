'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Ban, Loader2, MessageCircleQuestion, Send, X } from 'lucide-react';
import { useState } from 'react';
import type { RouteStepStatus } from '@tracker/shared';
import { requestApi } from '@/entities/request/api/requestApi';
import { RequestStatusBadge } from '@/entities/request/ui/RequestStatusBadge';
import { queryKeys } from '@/shared/api/queryKeys';
import { routes } from '@/shared/config/routes';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Label } from '@/shared/ui/label';
import { DashboardShell } from '@/widgets/dashboard-shell/DashboardShell';

const STEP_STATUS_LABELS: Record<RouteStepStatus, string> = {
  pending: 'Ожидает',
  active: 'В работе',
  completed: 'Завершён',
  skipped: 'Пропущен',
};

function RouteStepStatusBadge({ status }: { status: RouteStepStatus }) {
  const styles: Record<RouteStepStatus, string> = {
    pending: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    active: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300',
    completed: 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300',
    skipped: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500',
  };

  return (
    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status]}`}>
      {STEP_STATUS_LABELS[status]}
    </span>
  );
}

export function RequestDetailPage({ requestId }: { requestId: string }) {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [showRejectForm, setShowRejectForm] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showCancelForm, setShowCancelForm] = useState(false);
  const [infoMessage, setInfoMessage] = useState('');
  const [showRequestInfoForm, setShowRequestInfoForm] = useState(false);
  const [provideFieldsJson, setProvideFieldsJson] = useState('');
  const [provideComment, setProvideComment] = useState('');
  const [showProvideInfoForm, setShowProvideInfoForm] = useState(false);

  const { data, isLoading, error: loadError } = useQuery({
    queryKey: queryKeys.requests.detail(requestId),
    queryFn: () => requestApi.getById(requestId),
  });

  const invalidateRequest = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.requests.detail(requestId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.requests.outbox() });
    queryClient.invalidateQueries({ queryKey: queryKeys.requests.inbox() });
  };

  const submitMutation = useMutation({
    mutationFn: () => requestApi.submit(requestId),
    onSuccess: () => {
      invalidateRequest();
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const approveMutation = useMutation({
    mutationFn: () => requestApi.approve(requestId),
    onSuccess: () => {
      invalidateRequest();
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: (reason: string) => requestApi.reject(requestId, reason),
    onSuccess: () => {
      invalidateRequest();
      setError(null);
      setRejectReason('');
      setShowRejectForm(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  const cancelMutation = useMutation({
    mutationFn: (reason?: string) => requestApi.cancel(requestId, reason),
    onSuccess: () => {
      invalidateRequest();
      setError(null);
      setCancelReason('');
      setShowCancelForm(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  const requestInfoMutation = useMutation({
    mutationFn: (message: string) => requestApi.requestInfo(requestId, message),
    onSuccess: () => {
      invalidateRequest();
      setError(null);
      setInfoMessage('');
      setShowRequestInfoForm(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  const provideInfoMutation = useMutation({
    mutationFn: (input: { fields?: Record<string, unknown>; comment?: string }) =>
      requestApi.provideInfo(requestId, input),
    onSuccess: () => {
      invalidateRequest();
      setError(null);
      setProvideComment('');
      setShowProvideInfoForm(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  const canSubmit = data?.availableActions.includes('submit');
  const canApprove = data?.availableActions.includes('approve');
  const canReject = data?.availableActions.includes('reject');
  const canRequestInfo = data?.availableActions.includes('request_info');
  const canProvideInfo = data?.availableActions.includes('provide_info');
  const canCancel = data?.availableActions.includes('cancel');

  const openProvideInfoForm = () => {
    setProvideFieldsJson(JSON.stringify(data?.fields ?? {}, null, 2));
    setShowProvideInfoForm(true);
  };

  const handleProvideInfo = () => {
    try {
      const fields = provideFieldsJson.trim()
        ? (JSON.parse(provideFieldsJson) as Record<string, unknown>)
        : undefined;
      provideInfoMutation.mutate({
        fields,
        comment: provideComment.trim() || undefined,
      });
    } catch {
      setError('Некорректный JSON в полях запроса');
    }
  };

  return (
    <DashboardShell title={data?.title ?? 'Запрос'}>
      <Link href={routes.outbox} className="mb-4 inline-block text-sm text-primary hover:underline">
        ← Назад к исходящим
      </Link>

      {isLoading && <p className="text-muted-foreground">Загрузка...</p>}
      {loadError && (
        <Alert variant="destructive">
          <AlertDescription>{(loadError as Error).message}</AlertDescription>
        </Alert>
      )}

      {data && (
        <div className="space-y-6">
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-3">
                  <RequestStatusBadge status={data.status} />
                  {data.type && (
                    <span className="text-sm text-muted-foreground">{data.type.name}</span>
                  )}
                </div>
                <CardTitle>{data.title}</CardTitle>
                <CardDescription>Автор: {data.author.fullName}</CardDescription>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {canSubmit && (
                  <Button onClick={() => submitMutation.mutate()} disabled={submitMutation.isPending}>
                    {submitMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Отправить на согласование
                  </Button>
                )}
                {canApprove && (
                  <Button
                    variant="default"
                    onClick={() => approveMutation.mutate()}
                    disabled={approveMutation.isPending}
                  >
                    {approveMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Согласовать
                  </Button>
                )}
                {canReject && !showRejectForm && (
                  <Button
                    variant="destructive"
                    onClick={() => setShowRejectForm(true)}
                    disabled={rejectMutation.isPending}
                  >
                    <X className="h-4 w-4" />
                    Отклонить
                  </Button>
                )}
                {canRequestInfo && !showRequestInfoForm && (
                  <Button
                    variant="outline"
                    onClick={() => setShowRequestInfoForm(true)}
                    disabled={requestInfoMutation.isPending}
                  >
                    <MessageCircleQuestion className="h-4 w-4" />
                    Запросить уточнение
                  </Button>
                )}
                {canProvideInfo && !showProvideInfoForm && (
                  <Button onClick={openProvideInfoForm} disabled={provideInfoMutation.isPending}>
                    <MessageCircleQuestion className="h-4 w-4" />
                    Ответить на уточнение
                  </Button>
                )}
                {canCancel && !showCancelForm && (
                  <Button
                    variant="outline"
                    onClick={() => setShowCancelForm(true)}
                    disabled={cancelMutation.isPending}
                  >
                    <Ban className="h-4 w-4" />
                    Отменить запрос
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {data.status === 'pending_info' && (
                <Alert>
                  <AlertDescription>
                    Ожидается уточнение от автора запроса. После ответа согласование продолжится.
                  </AlertDescription>
                </Alert>
              )}
              {showRequestInfoForm && canRequestInfo && (
                <div className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                  <Label htmlFor="info-message">Что нужно уточнить?</Label>
                  <textarea
                    id="info-message"
                    value={infoMessage}
                    onChange={(e) => setInfoMessage(e.target.value)}
                    rows={3}
                    placeholder="Например: уточните даты командировки..."
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-field px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <div className="flex gap-2">
                    <Button
                      disabled={!infoMessage.trim() || requestInfoMutation.isPending}
                      onClick={() => requestInfoMutation.mutate(infoMessage.trim())}
                    >
                      {requestInfoMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <MessageCircleQuestion className="h-4 w-4" />
                      )}
                      Отправить запрос
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowRequestInfoForm(false);
                        setInfoMessage('');
                      }}
                    >
                      Закрыть
                    </Button>
                  </div>
                </div>
              )}
              {showProvideInfoForm && canProvideInfo && (
                <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <Label htmlFor="provide-fields">Обновлённые поля (JSON)</Label>
                  <textarea
                    id="provide-fields"
                    value={provideFieldsJson}
                    onChange={(e) => setProvideFieldsJson(e.target.value)}
                    rows={6}
                    className="flex min-h-[120px] w-full rounded-md border border-input bg-field px-3 py-2 font-mono text-xs shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <Label htmlFor="provide-comment">Комментарий (необязательно)</Label>
                  <textarea
                    id="provide-comment"
                    value={provideComment}
                    onChange={(e) => setProvideComment(e.target.value)}
                    rows={2}
                    placeholder="Пояснение к изменениям..."
                    className="flex min-h-[60px] w-full rounded-md border border-input bg-field px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <div className="flex gap-2">
                    <Button
                      disabled={provideInfoMutation.isPending}
                      onClick={handleProvideInfo}
                    >
                      {provideInfoMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="h-4 w-4" />
                      )}
                      Отправить ответ
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowProvideInfoForm(false);
                        setProvideComment('');
                      }}
                    >
                      Закрыть
                    </Button>
                  </div>
                </div>
              )}
              {showRejectForm && canReject && (
                <div className="space-y-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <Label htmlFor="reject-reason">Причина отклонения</Label>
                  <textarea
                    id="reject-reason"
                    value={rejectReason}
                    onChange={(e) => setRejectReason(e.target.value)}
                    rows={3}
                    placeholder="Укажите причину отклонения..."
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-field px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      disabled={!rejectReason.trim() || rejectMutation.isPending}
                      onClick={() => rejectMutation.mutate(rejectReason.trim())}
                    >
                      {rejectMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                      Подтвердить отклонение
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowRejectForm(false);
                        setRejectReason('');
                      }}
                    >
                      Закрыть
                    </Button>
                  </div>
                </div>
              )}
              {showCancelForm && canCancel && (
                <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-4">
                  <Label htmlFor="cancel-reason">Причина отмены (необязательно)</Label>
                  <textarea
                    id="cancel-reason"
                    value={cancelReason}
                    onChange={(e) => setCancelReason(e.target.value)}
                    rows={3}
                    placeholder="Например: больше не актуально..."
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-field px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      disabled={cancelMutation.isPending}
                      onClick={() =>
                        cancelMutation.mutate(cancelReason.trim() || undefined)
                      }
                    >
                      {cancelMutation.isPending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Ban className="h-4 w-4" />
                      )}
                      Подтвердить отмену
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowCancelForm(false);
                        setCancelReason('');
                      }}
                    >
                      Закрыть
                    </Button>
                  </div>
                </div>
              )}
              {data.submittedAt && (
                <p className="text-sm text-muted-foreground">
                  Отправлен: {new Date(data.submittedAt).toLocaleString('ru-RU')}
                </p>
              )}
            </CardContent>
          </Card>

          {data.route && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Маршрут согласования</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="space-y-3">
                  {data.route.steps.map((step) => (
                    <li
                      key={step.index}
                      className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
                        step.status === 'active'
                          ? 'border-primary/40 bg-primary/5'
                          : 'border-border'
                      }`}
                    >
                      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                        {step.index + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{step.name}</p>
                        <p className="text-sm text-muted-foreground">{step.assignee.fullName}</p>
                        {step.dueAt && (
                          <p className="mt-1 text-xs text-muted-foreground">
                            SLA: {new Date(step.dueAt).toLocaleString('ru-RU')}
                          </p>
                        )}
                      </div>
                      <RouteStepStatusBadge status={step.status} />
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Поля запроса</CardTitle>
            </CardHeader>
            <CardContent>
              {Object.keys(data.fields).length === 0 ? (
                <p className="text-sm text-muted-foreground">Дополнительные поля не заполнены.</p>
              ) : (
                <pre className="overflow-auto rounded-md bg-muted p-3 text-xs">
                  {JSON.stringify(data.fields, null, 2)}
                </pre>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </DashboardShell>
  );
}
