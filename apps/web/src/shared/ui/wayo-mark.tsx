import { cn } from '@/shared/lib/utils';

/** W from five waypoints — Wayo brand mark */
const NODES = [
  [4, 5],
  [8.5, 19],
  [12, 7],
  [15.5, 19],
  [20, 5],
] as const;

type WayoMarkProps = {
  className?: string;
  /** Draw rounded tile behind the mark (sidebar / login chip) */
  framed?: boolean;
  title?: string;
};

export function WayoMark({ className, framed = false, title }: WayoMarkProps) {
  const mark = (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={framed ? 'h-[58%] w-[58%]' : className}
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <polyline
        points={NODES.map(([x, y]) => `${x},${y}`).join(' ')}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {NODES.map(([x, y]) => (
        <circle key={`${x}-${y}`} cx={x} cy={y} r="2.15" fill="currentColor" />
      ))}
    </svg>
  );

  if (!framed) {
    return mark;
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-md border border-border bg-field text-primary',
        className,
      )}
    >
      {mark}
    </span>
  );
}
