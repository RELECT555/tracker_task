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
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-muted dark:bg-muted/10">
          {comments.map((comment) => (
            <li
              key={comment.id}
              className={cn('px-4 py-3.5', comment.isInternal && 'bg-amber-500/8 dark:bg-amber-500/10')}
            >
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{comment.author.fullName}</span>
                <time
                  dateTime={comment.createdAt}
                  className="font-mono text-xs text-muted-foreground tabular-nums"
                >
                  {new Date(comment.createdAt).toLocaleString('ru-RU')}
                </time>
                {comment.isInternal && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                    <Lock className="h-3 w-3" />
                    Внутренний
                  </span>
                )}
              </div>
              <p className="whitespace-pre-wrap text-sm">{comment.body}</p>
            </li>
          ))}
        </ul>
      )}

      {permissions.canComment && (
        <div className="space-y-3 rounded-lg border border-border bg-field p-4 dark:border-border/80">
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
              Внутренний комментарий (не виден автору)
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
