'use client';

import { useState } from 'react';
import { AlertCircle, RotateCcw } from 'lucide-react';
import { getUniqueErrorMessages } from '@/shared/lib/error-message';
import { cn } from '@/shared/lib/utils';
import { Button } from './button';

type ErrorNoticeProps = {
  title?: string;
  errors: readonly unknown[];
  onRetry?: () => unknown | Promise<unknown>;
  retrying?: boolean;
  retryLabel?: string;
  className?: string;
};

export function ErrorNotice({ title = 'Не удалось выполнить действие', errors, onRetry, retrying = false, retryLabel = 'Повторить', className }: ErrorNoticeProps) {
  const messages = getUniqueErrorMessages(errors);
  if (!messages.length) return null;

  return (
    <div role="alert" className={cn('flex items-start gap-3 rounded-xl border border-border bg-card p-4 text-sm', className)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-destructive/10 text-destructive">
        <AlertCircle aria-hidden="true" className="size-4" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
        <div className="min-w-0 space-y-1">
          <p className="text-balance font-medium leading-5 text-foreground">{title}</p>
          {messages.map((message) => <p key={message} className="text-pretty wrap-anywhere leading-5 text-muted-foreground">{message}</p>)}
        </div>
        {onRetry ? (
          <Button type="button" variant="outline" size="sm" className="min-h-9 shrink-0 self-start text-foreground sm:self-center" disabled={retrying} aria-busy={retrying} onClick={() => void onRetry()}>
            <RotateCcw aria-hidden="true" className="size-3.5" />
            {retrying ? 'Повторяем…' : retryLabel}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

type RetryableQuery = {
  error: unknown;
  isFetching: boolean;
  refetch: () => Promise<unknown>;
};

/** One recovery action for failed reads; mutations are never replayed. */
export function QueryErrorNotice({ title = 'Не удалось загрузить данные', queries, errors = [], className }: {
  title?: string;
  queries: readonly RetryableQuery[];
  errors?: readonly unknown[];
  className?: string;
}) {
  const [retryErrors, setRetryErrors] = useState<unknown[] | null>(null);
  const failedQueries = queries.filter((query) => query.error);
  const queryErrors = retryErrors ?? failedQueries.map((query) => query.error);
  const retrying = retryErrors !== null || failedQueries.some((query) => query.isFetching);

  async function retry() {
    if (retrying) return;
    setRetryErrors(failedQueries.map((query) => query.error));
    try {
      await Promise.allSettled(failedQueries.map((query) => query.refetch()));
    } finally {
      setRetryErrors(null);
    }
  }

  return <ErrorNotice
    title={title}
    errors={[...queryErrors, ...errors]}
    onRetry={failedQueries.length || retryErrors ? retry : undefined}
    retrying={retrying}
    retryLabel={errors.some(Boolean) ? 'Повторить загрузку' : 'Повторить'}
    className={className}
  />;
}
