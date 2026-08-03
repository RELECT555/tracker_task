'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';
import { useTour } from '@/features/onboarding/model/TourProvider';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';

type Rect = { top: number; left: number; width: number; height: number };

const PADDING = 8;
const CARD_WIDTH = 340;
const CARD_GAP = 14;
const VIEWPORT_MARGIN = 16;
/** The anchor may not exist yet right after a route change. */
const LOOKUP_TIMEOUT_MS = 4000;

function readRect(element: Element): Rect {
  const box = element.getBoundingClientRect();
  return {
    top: box.top - PADDING,
    left: box.left - PADDING,
    width: box.width + PADDING * 2,
    height: box.height + PADDING * 2,
  };
}

/**
 * Pick the side with room for the whole card: below → above → right → left.
 * A tall anchor (the sidebar) has no space above or below, so it lands beside.
 */
function placeCard(rect: Rect | null, cardHeight: number): { top: number; left: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const clampTop = (value: number) =>
    Math.min(Math.max(VIEWPORT_MARGIN, value), Math.max(VIEWPORT_MARGIN, vh - cardHeight - VIEWPORT_MARGIN));
  const clampLeft = (value: number) =>
    Math.min(Math.max(VIEWPORT_MARGIN, value), Math.max(VIEWPORT_MARGIN, vw - CARD_WIDTH - VIEWPORT_MARGIN));

  if (!rect) {
    return { top: clampTop(vh / 2 - cardHeight / 2), left: clampLeft(vw / 2 - CARD_WIDTH / 2) };
  }

  const centerX = rect.left + rect.width / 2 - CARD_WIDTH / 2;
  const centerY = rect.top + rect.height / 2 - cardHeight / 2;

  const fitsBelow = rect.top + rect.height + CARD_GAP + cardHeight + VIEWPORT_MARGIN <= vh;
  if (fitsBelow) {
    return { top: rect.top + rect.height + CARD_GAP, left: clampLeft(centerX) };
  }

  const fitsAbove = rect.top - CARD_GAP - cardHeight - VIEWPORT_MARGIN >= 0;
  if (fitsAbove) {
    return { top: rect.top - CARD_GAP - cardHeight, left: clampLeft(centerX) };
  }

  const fitsRight = rect.left + rect.width + CARD_GAP + CARD_WIDTH + VIEWPORT_MARGIN <= vw;
  if (fitsRight) {
    return { top: clampTop(centerY), left: rect.left + rect.width + CARD_GAP };
  }

  const fitsLeft = rect.left - CARD_GAP - CARD_WIDTH - VIEWPORT_MARGIN >= 0;
  if (fitsLeft) {
    return { top: clampTop(centerY), left: rect.left - CARD_GAP - CARD_WIDTH };
  }

  // Nothing fits (anchor fills the screen) — centre it and let the dim carry.
  return { top: clampTop(vh / 2 - cardHeight / 2), left: clampLeft(centerX) };
}

export function TourOverlay() {
  const { isActive, step, stepIndex, total, next, prev, stop } = useTour();
  const pathname = usePathname();
  const cardRef = useRef<HTMLDivElement>(null);
  const [rect, setRect] = useState<Rect | null>(null);
  const [cardHeight, setCardHeight] = useState(220);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Real height — the copy length differs per step, guessing misplaces the card.
  useLayoutEffect(() => {
    if (!cardRef.current) return;
    const measured = cardRef.current.offsetHeight;
    setCardHeight((current) => (Math.abs(current - measured) > 1 ? measured : current));
  }, [step, stepIndex, isActive, rect]);

  // Track the anchor: wait for it to appear, then follow scroll / resize.
  useEffect(() => {
    if (!isActive || !step) {
      setRect(null);
      return;
    }

    const selector = `[data-tour="${step.anchor}"]`;
    const deadline = performance.now() + LOOKUP_TIMEOUT_MS;

    // Polling instead of one lookup: the anchor may mount after data loads, and
    // the same tick keeps the spotlight glued to it when the layout shifts.
    const sync = () => {
      const found = document.querySelector(selector);
      if (found) {
        setRect(readRect(found));
      } else if (performance.now() > deadline) {
        setRect(null);
      }
    };

    sync();
    const timer = window.setInterval(sync, 150);
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [isActive, step, pathname]);

  useEffect(() => {
    if (!isActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') stop();
      if (event.key === 'ArrowRight') next();
      if (event.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isActive, next, prev, stop]);

  if (!mounted || !isActive || !step) {
    return null;
  }

  const isLast = stepIndex + 1 === total;
  const { top: cardTop, left: cardLeft } = placeCard(rect, cardHeight);

  return createPortal(
    <div className="fixed inset-0 z-[100]" role="dialog" aria-modal="true" aria-label="Тур по интерфейсу">
      {/* Spotlight: the ring's huge outer shadow dims everything except the anchor */}
      {rect ? (
        <div
          className="pointer-events-none absolute rounded-xl ring-2 ring-primary/70 transition-all duration-300 ease-out"
          style={{
            top: rect.top,
            left: rect.left,
            width: rect.width,
            height: rect.height,
            boxShadow: '0 0 0 9999px hsl(240 10% 4% / 0.62)',
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-[hsl(240_10%_4%/0.62)]" />
      )}

      {/* Blocks clicks on the app while the tour drives */}
      <div className="absolute inset-0" onClick={(event) => event.stopPropagation()} />

      <div
        ref={cardRef}
        className={cn(
          'absolute w-[340px] rounded-2xl border border-border bg-card p-5 shadow-2xl',
          'animate-in fade-in duration-300',
        )}
        style={{ top: cardTop, left: cardLeft }}
      >
        <div className="flex items-start justify-between gap-3">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Шаг {stepIndex + 1} из {total}
          </span>
          <button
            type="button"
            onClick={stop}
            aria-label="Закрыть тур"
            className="-mr-1 -mt-1 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
          >
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>

        <p className="mt-2 text-base font-semibold tracking-tight text-foreground">
          {step.title}
        </p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.text}</p>

        <div className="mt-4 flex items-center gap-1.5">
          {Array.from({ length: total }, (_, index) => (
            <span
              key={index}
              className={cn(
                'h-1.5 rounded-full transition-all',
                index === stepIndex ? 'w-5 bg-primary' : 'w-1.5 bg-border',
              )}
            />
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={stepIndex === 0 ? stop : prev}
            className="text-muted-foreground"
          >
            {stepIndex === 0 ? (
              'Пропустить'
            ) : (
              <>
                <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} />
                Назад
              </>
            )}
          </Button>
          <Button size="sm" onClick={next} className="gap-1.5">
            {isLast ? 'Готово' : 'Далее'}
            {isLast ? null : <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
