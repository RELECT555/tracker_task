'use client';

import { usePathname, useRouter } from '@/shared/lib/router/navigation';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { routes } from '@/shared/config/routes';
import { Button } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';
import { tourSteps } from '../model/tour-steps';
import { hasSeenTour, productTour, useProductTour } from '../model/tour-store';

type Box = { top: number; left: number; width: number; height: number };

const SPOTLIGHT_PADDING = 6;
const CARD_GAP = 14;
const VIEWPORT_MARGIN = 16;
/**
 * Сколько ждём появления элемента, прежде чем показать шаг по центру. Карточка скрыта только это время;
 * если элемент появится позже (данные ещё грузятся), она сама переедет к нему.
 */
const TARGET_WAIT_MS = 700;
const MISSING_POLL_MS = 100;
/** Сколько кадров подряд подсветка должна простоять неподвижно, чтобы перестать измерять каждый кадр. */
const STABLE_FRAMES = 20;
const IDLE_RECHECK_MS = 250;
const AUTO_START_DELAY_MS = 900;

function findTarget(target: string | undefined) {
  if (!target) return null;
  for (const element of document.querySelectorAll<HTMLElement>(`[data-tour="${target}"]`)) {
    const { width, height } = element.getBoundingClientRect();
    // На узких экранах часть элементов скрыта (боковая панель): считаем их отсутствующими.
    if (width > 0 && height > 0) return element;
  }
  return null;
}

function sameBox(a: Box | null, b: Box | null) {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height;
}

function placeCard(target: Box | null, card: { width: number; height: number }, viewport: { width: number; height: number }) {
  const clampX = (x: number) => Math.min(Math.max(VIEWPORT_MARGIN, x), Math.max(VIEWPORT_MARGIN, viewport.width - card.width - VIEWPORT_MARGIN));
  const clampY = (y: number) => Math.min(Math.max(VIEWPORT_MARGIN, y), Math.max(VIEWPORT_MARGIN, viewport.height - card.height - VIEWPORT_MARGIN));
  if (!target) return { top: clampY((viewport.height - card.height) / 2), left: clampX((viewport.width - card.width) / 2) };

  const right = target.left + target.width;
  const bottom = target.top + target.height;
  const centeredX = clampX(target.left + target.width / 2 - card.width / 2);
  const centeredY = clampY(target.top + target.height / 2 - card.height / 2);
  const room = {
    below: viewport.height - bottom - CARD_GAP - VIEWPORT_MARGIN >= card.height,
    above: target.top - CARD_GAP - VIEWPORT_MARGIN >= card.height,
    right: viewport.width - right - CARD_GAP - VIEWPORT_MARGIN >= card.width,
    left: target.left - CARD_GAP - VIEWPORT_MARGIN >= card.width,
  };
  if (room.below) return { top: bottom + CARD_GAP, left: centeredX };
  if (room.above) return { top: target.top - CARD_GAP - card.height, left: centeredX };
  if (room.right) return { top: centeredY, left: right + CARD_GAP };
  if (room.left) return { top: centeredY, left: target.left - CARD_GAP - card.width };
  // Элемент почти во весь экран: карточка поверх него, у нижнего края.
  return { top: clampY(viewport.height - card.height - VIEWPORT_MARGIN), left: centeredX };
}

function TourOverlay({ isAdmin }: { isAdmin: boolean }) {
  const { index, goTo, stop } = useProductTour();
  const router = useRouter();
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const steps = useMemo(() => tourSteps.filter((step) => isAdmin || !step.adminOnly), [isAdmin]);
  const stepIndex = Math.min(index, steps.length - 1);
  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;

  // Состояние привязано к шагу: при смене шага карточка не успевает мелькнуть на старом месте с новым текстом.
  const [tracked, setTracked] = useState<{ stepId: string; box: Box | null; settled: boolean } | null>(null);
  const current = tracked?.stepId === step.id ? tracked : null;
  const target = current?.box ?? null;
  const settled = current?.settled ?? !step.target;
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [cardSize, setCardSize] = useState({ width: 360, height: 220 });
  const card = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  const next = () => (isLast ? stop() : goTo(stepIndex + 1));
  const previous = () => goTo(Math.max(0, stepIndex - 1));
  const actions = useRef({ next, previous, stop });
  actions.current = { next, previous, stop };

  // Переходим на страницу шага. Страница шага не пересчитывается при ручной навигации, поэтому зависим только от шага.
  useEffect(() => {
    if (step.route && pathnameRef.current !== step.route) router.push(step.route);
  }, [router, step.id, step.route]);

  // Следим за элементом: он может появиться после загрузки данных, сдвинуться при прокрутке и ресайзе.
  // Кадр за кадром измеряем только пока подсветка движется; когда она встала, засыпаем и просыпаемся по событию.
  useEffect(() => {
    let frame = 0;
    let timer = 0;
    let stableFrames = 0;
    let lastBox: Box | null = null;
    let observed: HTMLElement | null = null;
    let scrolledIntoView = false;
    const startedAt = performance.now();
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const resizeObserver = new ResizeObserver(() => wake());

    const measure = () => {
      setViewport((current) => (current.width === window.innerWidth && current.height === window.innerHeight ? current : { width: window.innerWidth, height: window.innerHeight }));
      const element = findTarget(step.target);
      if (element !== observed) {
        resizeObserver.disconnect();
        observed = element;
        if (element) resizeObserver.observe(element);
      }
      if (!element) {
        lastBox = null;
        const settledNow = performance.now() - startedAt > TARGET_WAIT_MS;
        setTracked((previous) => (previous?.stepId === step.id && !previous.box && previous.settled === settledNow ? previous : { stepId: step.id, box: null, settled: settledNow }));
        return false;
      }
      if (!scrolledIntoView) {
        scrolledIntoView = true;
        element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' });
      }
      const { top, left, width, height } = element.getBoundingClientRect();
      const box = { top: top - SPOTLIGHT_PADDING, left: left - SPOTLIGHT_PADDING, width: width + SPOTLIGHT_PADDING * 2, height: height + SPOTLIGHT_PADDING * 2 };
      const changed = !sameBox(lastBox, box);
      lastBox = box;
      setTracked((previous) => (previous?.stepId === step.id && previous.settled && sameBox(previous.box, box) ? previous : { stepId: step.id, box, settled: true }));
      return changed;
    };

    const run = () => {
      frame = 0;
      timer = 0;
      const changed = measure();
      if (!lastBox) {
        // Элемента ещё нет (страница или данные грузятся): проверяем реже, чем каждый кадр.
        timer = window.setTimeout(run, MISSING_POLL_MS);
        return;
      }
      stableFrames = changed ? 0 : stableFrames + 1;
      if (stableFrames < STABLE_FRAMES) frame = requestAnimationFrame(run);
    };
    function wake() {
      stableFrames = 0;
      if (!frame && !timer) frame = requestAnimationFrame(run);
    }

    wake();
    // Прокрутка любого контейнера и ресайз окна сдвигают элемент; сдвиги вёрстки без событий ловит редкая проверка.
    window.addEventListener('scroll', wake, { capture: true, passive: true });
    window.addEventListener('resize', wake);
    // Одно измерение без пробуждения цикла: будим его, только если элемент действительно сдвинулся.
    const watchdog = window.setInterval(() => {
      if (!frame && !timer && measure()) wake();
    }, IDLE_RECHECK_MS);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.clearInterval(watchdog);
      window.removeEventListener('scroll', wake, true);
      window.removeEventListener('resize', wake);
      resizeObserver.disconnect();
    };
  }, [step.id, step.target]);

  // Подгружаем страницу следующего шага заранее, чтобы переход не ждал загрузки кода страницы.
  const nextRoute = steps[stepIndex + 1]?.route;
  useEffect(() => {
    if (nextRoute && nextRoute !== pathnameRef.current) router.prefetch(nextRoute);
  }, [router, nextRoute]);

  useLayoutEffect(() => {
    const element = card.current;
    if (!element) return;
    const measure = () => setCardSize({ width: element.offsetWidth, height: element.offsetHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Фокус на карточке: скринридер читает название и описание шага, клавиатура остаётся внутри тура.
  useEffect(() => {
    if (settled) card.current?.focus({ preventScroll: true });
  }, [settled, step.id]);

  useEffect(() => {
    const restoreTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        actions.current.stop();
      } else if (event.key === 'ArrowRight') {
        event.preventDefault();
        actions.current.next();
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault();
        actions.current.previous();
      } else if (event.key === 'Tab' && card.current) {
        const focusable = [...card.current.querySelectorAll<HTMLElement>('button:not([disabled])')];
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const current = document.activeElement;
        if (!card.current.contains(current) || (event.shiftKey && (current === first || current === card.current))) {
          event.preventDefault();
          (event.shiftKey ? last : first)?.focus();
        } else if (!event.shiftKey && current === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      if (restoreTo?.isConnected) restoreTo.focus({ preventScroll: true });
    };
  }, []);

  const spotlight: Box = target ?? { top: viewport.height / 2, left: viewport.width / 2, width: 0, height: 0 };
  const position = placeCard(target, cardSize, viewport);

  return (
    <div data-product-tour="">
      <div aria-hidden="true" className="fixed inset-0 z-[100]" />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed z-[101] rounded-xl transition-[top,left,width,height] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
        style={{
          ...spotlight,
          boxShadow: `0 0 0 2px hsl(var(--primary)), 0 0 0 9999px hsl(var(--foreground) / 0.58)`,
        }}
      />
      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        className={cn(
          'fixed z-[102] w-[min(22.5rem,calc(100vw-2rem))] rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl outline-none transition-[top,left,opacity] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none',
          settled ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        style={{ top: position.top, left: position.left }}
      >
        <div className="flex items-start justify-between gap-3">
          <p className="text-xs font-medium tabular-nums text-muted-foreground">Шаг {stepIndex + 1} из {steps.length}</p>
          <button
            type="button"
            onClick={stop}
            aria-label="Закрыть тур"
            className="-mr-1 -mt-1 inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>
        <h2 id={titleId} className="mt-1 text-base font-semibold tracking-tight">{step.title}</h2>
        <p id={descriptionId} className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.description}</p>
        <div aria-hidden="true" className="mt-4 flex gap-1">
          {steps.map(({ id }, dotIndex) => (
            <span key={id} className={cn('h-1 flex-1 rounded-full transition-colors', dotIndex <= stepIndex ? 'bg-primary' : 'bg-border')} />
          ))}
        </div>
        <div className="mt-4 flex items-center justify-between gap-2">
          {isLast ? <span /> : <Button type="button" variant="ghost" size="sm" onClick={stop} className="text-muted-foreground">Пропустить</Button>}
          <div className="flex items-center gap-2">
            {!isFirst ? <Button type="button" variant="outline" size="sm" onClick={previous}>Назад</Button> : null}
            <Button type="button" size="sm" onClick={next}>{isLast ? 'Завершить' : isFirst ? 'Начать' : 'Далее'}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Пошаговый тур по продукту. Подсвечивает элементы с атрибутом `data-tour`
 * и сам переходит между страницами. Один раз предлагается на главной странице.
 */
export function ProductTour({ enabled, isAdmin }: { enabled: boolean; isAdmin: boolean }) {
  const { active } = useProductTour();
  const pathname = usePathname();

  useEffect(() => {
    if (!enabled || pathname !== routes.home || hasSeenTour()) return;
    const timer = window.setTimeout(() => productTour.start(), AUTO_START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [enabled, pathname]);

  return enabled && active ? <TourOverlay isAdmin={isAdmin} /> : null;
}
