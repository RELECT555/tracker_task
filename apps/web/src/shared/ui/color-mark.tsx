import { cn } from '@/shared/lib/utils';

const sizes = {
  xs: { shell: 'h-3.5 w-3.5 rounded-[5px]', center: 'h-1 w-1' },
  sm: { shell: 'h-4 w-4 rounded-[5px]', center: 'h-1.5 w-1.5' },
  md: { shell: 'h-5 w-5 rounded-[6px]', center: 'h-2 w-2' },
} as const;

export function ColorMark({
  color,
  size = 'sm',
  className,
}: {
  color: string;
  size?: keyof typeof sizes;
  className?: string;
}) {
  const dimension = sizes[size];

  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative inline-flex shrink-0 items-center justify-center border border-white/45 shadow-sm ring-1 ring-black/[0.06]',
        dimension.shell,
        className,
      )}
      style={{ backgroundColor: color, boxShadow: 'inset 0 1px 1px rgb(255 255 255 / 0.4), 0 1px 2px rgb(0 0 0 / 0.12)' }}
    >
      <span
        className={cn(
          'rotate-45 rounded-[1px] border border-white/90 bg-white/35 shadow-[0_0_3px_rgb(255_255_255/0.55)]',
          dimension.center,
        )}
      />
    </span>
  );
}
