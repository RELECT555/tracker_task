import { cn } from '@/shared/lib/utils';

const dotSizes = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
} as const;

/** Компактная цветовая метка роли для таблиц, списков и пилюль. */
export function ColorMark({
  color,
  size = 'sm',
  className,
}: {
  color: string;
  size?: keyof typeof dotSizes;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-block shrink-0 rounded-full', dotSizes[size], className)}
      style={{ backgroundColor: color, boxShadow: `0 0 0 3px color-mix(in srgb, ${color} 18%, transparent)` }}
    />
  );
}

const tileSizes = {
  sm: 'h-7 w-7 rounded-md text-[11px]',
  md: 'h-9 w-9 rounded-lg text-xs',
} as const;

function monogram(name: string) {
  // «Backend (демо)» → «B»: пояснения в скобках и знаки препинания в инициалы не попадают.
  const words = name.replace(/\([^)]*\)/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(' ').filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toLocaleUpperCase('ru-RU');
  const word = words[0] ?? '?';
  if (word.length <= 3 && word === word.toLocaleUpperCase('ru-RU')) return word;
  return word[0].toLocaleUpperCase('ru-RU');
}

/** Иконка роли: плитка в цвет роли с её инициалами. */
export function RoleMark({
  name,
  color,
  size = 'md',
  className,
}: {
  name: string;
  color: string;
  size?: keyof typeof tileSizes;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex shrink-0 select-none items-center justify-center font-semibold tracking-tight', tileSizes[size], className)}
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 15%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 30%, transparent)`,
        color: `color-mix(in oklab, ${color} 70%, hsl(var(--foreground)))`,
      }}
    >
      {monogram(name)}
    </span>
  );
}
