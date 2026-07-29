'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, MessageSquare, Lock } from 'lucide-react';
import { useState } from 'react';
import type { RequestComment, CommentPermissions } from '@/entities/request/api/requestApi';
import { requestApi } from '@/entities/request/api/requestApi';
import { queryKeys } from '@/shared/api/queryKeys';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Label } from '@/shared/ui/label';

export function RequestComments({
  requestId,
  comments,
  permissions,
  embedded = false,
}: {
  requestId: string;
  comments: RequestComment[];
  permissions: CommentPermissions;
  embedded?: boolean;
}) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => requestApi.addComment(requestId, body.trim(), isInternal || undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.requests.detail(requestId) });
      setBody('');
      setIsInternal(false);
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  if (!permissions.canComment && comments.length === 0) {
    return null;
  }

  const content = (
    <div className="space-y-4">
      {comments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border/70 px-4 py-6 text-center text-sm text-muted-foreground">
          Комментариев пока нет.
        </p>
      ) : (
        <ul className="space-y-2">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className={cn(
                'rounded-lg border px-4 py-3.5 transition-colors duration-200',
                comment.isInternal
                  ? 'border-amber-500/25 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-500/[0.07]'
                  : 'border-border bg-card dark:bg-muted/10',
              )}
            >
              <div className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium">{comment.author.fullName}</span>
                <time
                  dateTime={comment.createdAt}
                  className="font-mono text-xs text-muted-foreground tabular-nums"
                >
                  {new Date(comment.createdAt).toLocaleString('ru-RU')}
                </time>
                {comment.isInternal && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                    <Lock className="h-3 w-3 shrink-0" aria-hidden />
                    Внутренний
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {comment.body}
              </p>
            </li>
          ))}
        </ul>
      )}

      {permissions.canComment && (
        <div
          className={cn(
            'space-y-3 rounded-lg border p-4 transition-colors duration-200',
            isInternal
              ? 'border-amber-500/30 bg-amber-50/40 dark:border-amber-500/25 dark:bg-amber-500/[0.06]'
              : 'border-border bg-field dark:border-border/80',
          )}
        >
          <Label htmlFor="comment-body" className="text-xs font-medium text-foreground">
            Новый комментарий
          </Label>
          <textarea
            id="comment-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Напишите комментарий..."
            className="flex min-h-[72px] w-full rounded-md border border-input bg-field px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 dark:border-border/70"
          />
          {permissions.canInternalComment && (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={isInternal}
                onChange={(e) => setIsInternal(e.target.checked)}
                className="rounded border-input"
              />
              <span className="inline-flex items-center gap-1.5">
                <Lock className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                Внутренний комментарий (не виден автору)
              </span>
            </label>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button disabled={!body.trim() || mutation.isPending} onClick={() => mutation.mutate()}>
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquare className="h-4 w-4" />
            )}
            Отправить
          </Button>
        </div>
      )}
    </div>
  );

  if (embedded) return content;

  return (
    <Card>
      <CardHeader className="border-b border-border/60 bg-muted/20 py-4 dark:bg-muted/10">
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
          Комментарии
          {comments.length > 0 && (
            <span className="text-sm font-normal text-muted-foreground">({comments.length})</span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-5">{content}</CardContent>
    </Card>
  );
}
