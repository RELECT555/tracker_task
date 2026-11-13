'use client';

import { useState } from 'react';
import { CircleHelp } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

export function HelpHint({ text, example, faqId }: { text: string; example?: string; faqId?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Подсказка. ${text}`} className="inline-flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
          <CircleHelp aria-hidden="true" className="size-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-xs leading-relaxed" side="top">
        <p>{text}</p>
        {example ? <p className="mt-2 text-muted-foreground"><span className="font-medium text-foreground">Пример:</span> {example}</p> : null}
        {faqId ? <a href={`#faq-${faqId}`} onClick={() => setOpen(false)} className="mt-1 inline-flex min-h-6 items-center rounded text-status-progress-fg underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-ring">Подробнее в FAQ</a> : null}
      </PopoverContent>
    </Popover>
  );
}
