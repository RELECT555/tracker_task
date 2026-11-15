'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, LoaderCircle, RotateCcw, Send, Sparkles } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { cn } from '@/shared/lib/utils';
import { getErrorMessage } from '@/shared/lib/error-message';
import { agentApi, type AgentApplyResult, type AgentProposal } from '../api/agentApi';

type Message = { role: 'user' | 'assistant'; content: string; proposals?: ProposalSet };
type ProposalSet = { items: AgentProposal[]; selected: Set<number>; results?: AgentApplyResult[] };

const EXAMPLES = ['Кто перегружен в этом квартале?', 'Какие фичи не запланированы?', 'Где факт превышает план?'];

const hours = (value: number | null) => (value === null ? '—' : `${value} ч`);

function ProposalCard({ set, applying, onToggle, onApply }: {
  set: ProposalSet; applying: boolean; onToggle: (index: number) => void; onApply: () => void;
}) {
  const done = set.items.every((_, index) => set.results?.some((result) => result.index === index && result.ok));
  const selected = set.items.filter((_, index) => set.selected.has(index));
  return <div className="mt-2 overflow-hidden rounded-lg border border-border bg-card text-xs">
    <div className="border-b border-border bg-muted/40 px-3 py-1.5 font-medium">Предложенные изменения</div>
    <ul className="divide-y divide-border/60">
      {set.items.map((item, index) => {
        const result = set.results?.find((entry) => entry.index === index);
        return <li key={`${item.workItemId}-${item.roleId}-${item.personExternalId}-${item.quarterKey}`} className="flex items-start gap-2 px-3 py-2">
          <input type="checkbox" aria-label={`Применить: ${item.workItemTitle}`} className="mt-0.5" checked={set.selected.has(index)} disabled={applying || Boolean(done) || result?.ok} onChange={() => onToggle(index)} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium" title={item.workItemTitle}>{item.workItemTitle}</div>
            <div className="text-muted-foreground">{item.roleName} · {item.personName} · {item.quarterKey}</div>
            <div className="mt-0.5 tabular-nums">{hours(item.fromHours)} → <span className="font-semibold">{hours(item.toHours)}</span></div>
            {item.reason ? <div className="mt-0.5 text-muted-foreground">{item.reason}</div> : null}
            {result?.ok ? <div className="mt-0.5 flex items-center gap-1 text-primary"><Check aria-hidden="true" className="size-3" />Применено</div> : null}
            {result && !result.ok ? <div className="mt-0.5 text-destructive">{result.error ?? 'Не удалось применить'}</div> : null}
          </div>
        </li>;
      })}
    </ul>
    {!done ? <div className="border-t border-border px-3 py-2">
      <Button type="button" size="sm" className="h-8 w-full gap-2 text-xs" disabled={!selected.length || applying} onClick={onApply}>
        {applying ? <LoaderCircle aria-hidden="true" className="size-3.5 motion-safe:animate-spin" /> : <Check aria-hidden="true" className="size-3.5" />}
        {applying ? 'Применяем…' : `Применить (${selected.length})`}
      </Button>
    </div> : null}
  </div>;
}

export function AgentPanel({ projectId, quarterKey, canEditPlan, onApplied }: {
  projectId: string; quarterKey: string; canEditPlan: boolean; onApplied: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [history, setHistory] = useState<unknown[]>([]);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const status = useQuery({ queryKey: ['ai', 'status'], queryFn: agentApi.status, staleTime: 5 * 60_000, retry: false });

  const scrollDown = () => setTimeout(() => bottom.current?.scrollIntoView({ block: 'end' }), 0);

  const chat = useMutation({
    mutationFn: (prompt: string) => agentApi.chat({ projectId, quarterKey, prompt, history }),
    onSuccess: (result) => {
      setHistory(result.history);
      setMessages((current) => [...current, {
        role: 'assistant',
        content: result.reply,
        proposals: result.proposals.length ? { items: result.proposals, selected: new Set(result.proposals.map((_, index) => index)) } : undefined,
      }]);
      scrollDown();
    },
    onError: (cause) => setError(getErrorMessage(cause)),
  });

  const apply = useMutation({
    mutationFn: ({ items }: { messageIndex: number; items: AgentProposal[] }) => agentApi.apply(projectId, items),
    onSuccess: ({ results }, { messageIndex }) => {
      setMessages((current) => current.map((message, index) => {
        if (index !== messageIndex || !message.proposals) return message;
        const { items, selected } = message.proposals;
        const chosen = items.map((_, i) => i).filter((i) => selected.has(i));
        // Results are indexed within the submitted subset; map them back to the card rows.
        const byRow = new Map((message.proposals.results ?? []).map((result) => [result.index, result]));
        for (const result of results) byRow.set(chosen[result.index], { ...result, index: chosen[result.index] });
        const merged = [...byRow.values()];
        const failed = new Set(merged.filter((result) => !result.ok).map((result) => result.index));
        return { ...message, proposals: { items, selected: failed, results: merged } };
      }));
      onApplied();
    },
    onError: (cause) => setError(getErrorMessage(cause)),
  });

  const send = (text: string) => {
    const prompt = text.trim();
    if (!prompt || chat.isPending) return;
    setError(null);
    setDraft('');
    setMessages((current) => [...current, { role: 'user', content: prompt }]);
    scrollDown();
    chat.mutate(prompt);
  };

  const reset = () => { setMessages([]); setHistory([]); setError(null); setDraft(''); };

  if (!status.data?.configured) return null;

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <Button type="button" variant="ghost" size="sm" className="h-8 shrink-0 gap-1.5 text-xs text-muted-foreground hover:text-foreground" title="Спросить ассистента о плане"><Sparkles aria-hidden="true" className="size-3.5" />Ассистент</Button>
    </PopoverTrigger>
    <PopoverContent align="start" side="bottom" sideOffset={8} collisionPadding={16} className="flex h-[min(34rem,calc(100dvh-8rem))] w-[min(30rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl p-0">
      <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border px-4 py-2.5">
        <div className="min-w-0"><h3 className="text-sm font-semibold">Ассистент плана</h3><p className="text-xs text-muted-foreground">{canEditPlan ? 'Отвечает по плану и предлагает правки — применяете их вы' : 'Отвечает по плану (только просмотр)'}</p></div>
        <Button type="button" variant="ghost" size="icon" className="size-8 shrink-0" aria-label="Начать диалог заново" title="Начать заново" disabled={!messages.length || chat.isPending} onClick={reset}><RotateCcw aria-hidden="true" className="size-3.5" /></Button>
      </header>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-4 py-3" aria-live="polite">
        {!messages.length ? <div className="space-y-2 pt-2">
          <p className="text-xs text-muted-foreground">Например:</p>
          {EXAMPLES.map((example) => <button key={example} type="button" onClick={() => send(example)} className="block w-full rounded-md border border-border px-3 py-2 text-left text-xs hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">{example}</button>)}
        </div> : null}
        {messages.map((message, index) => <div key={index} className={cn('flex flex-col', message.role === 'user' ? 'items-end' : 'items-start')}>
          <div className={cn('max-w-[92%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm', message.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted')}>{message.content}</div>
          {message.proposals ? <div className="w-full">
            <ProposalCard
              set={message.proposals}
              applying={apply.isPending && apply.variables?.messageIndex === index}
              onToggle={(i) => setMessages((current) => current.map((m, mi) => {
                if (mi !== index || !m.proposals) return m;
                const selected = new Set(m.proposals.selected);
                if (selected.has(i)) selected.delete(i); else selected.add(i);
                return { ...m, proposals: { ...m.proposals, selected } };
              }))}
              onApply={() => {
                const { items, selected } = message.proposals!;
                setError(null);
                apply.mutate({ messageIndex: index, items: items.filter((_, i) => selected.has(i)) });
              }}
            />
          </div> : null}
        </div>)}
        {chat.isPending ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><LoaderCircle aria-hidden="true" className="size-3.5 motion-safe:animate-spin" />Думаю…</div> : null}
        {error ? <p role="alert" className="text-xs text-destructive">{error}</p> : null}
        <div ref={bottom} />
      </div>
      <form className="flex shrink-0 items-end gap-2 border-t border-border p-3" onSubmit={(event) => { event.preventDefault(); send(draft); }}>
        <textarea
          value={draft}
          rows={1}
          maxLength={4000}
          aria-label="Сообщение ассистенту"
          placeholder="Спросите о плане…"
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(draft); } }}
          className="max-h-28 min-h-9 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        />
        <Button type="submit" size="icon" className="size-9 shrink-0" aria-label="Отправить" disabled={!draft.trim() || chat.isPending}><Send aria-hidden="true" className="size-4" /></Button>
      </form>
    </PopoverContent>
  </Popover>;
}
