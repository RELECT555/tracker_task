'use client';

import { CircleHelp } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';

export function HelpHint({ text, example, faqId }: { text: string; example?: string; faqId?: string }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Подсказка" className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
          <CircleHelp className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-xs leading-relaxed" side="top">
        <p>{text}</p>
        {example ? <p className="mt-2 text-muted-foreground"><span className="font-medium text-foreground">Пример:</span> {example}</p> : null}
        {faqId ? <a href={`#faq-${faqId}`} className="mt-2 inline-block text-primary underline-offset-2 hover:underline">Подробнее в FAQ</a> : null}
      </PopoverContent>
    </Popover>
  );
}
