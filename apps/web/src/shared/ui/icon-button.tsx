import { forwardRef, type ReactNode } from 'react';
import { Button, type ButtonProps } from '@/shared/ui/button';
import { cn } from '@/shared/lib/utils';

type TooltipSide = 'top' | 'bottom' | 'left' | 'right';
type TooltipAlign = 'start' | 'center' | 'end';

export interface IconButtonProps extends Omit<ButtonProps, 'children'> {
  /** Accessible name; also shown as the tooltip on hover and keyboard focus. */
  label: string;
  /** Tooltip text when it should differ from the accessible name, e.g. to explain why the action is unavailable. */
  tooltip?: ReactNode;
  icon: ReactNode;
  /** Extra inline content after the icon, such as a counter. Hidden from assistive tech: put it into `label`. */
  badge?: ReactNode;
  side?: TooltipSide;
  align?: TooltipAlign;
  wrapperClassName?: string;
}

const sideClass: Record<TooltipSide, string> = {
  bottom: 'top-full mt-1.5',
  top: 'bottom-full mb-1.5',
  left: 'right-full mr-1.5 top-1/2 -translate-y-1/2',
  right: 'left-full ml-1.5 top-1/2 -translate-y-1/2',
};

const alignClass: Record<TooltipAlign, string> = {
  start: 'left-0',
  center: 'left-1/2 -translate-x-1/2',
  end: 'right-0',
};

/**
 * Icon-only button: the action is named by a tooltip on hover and focus instead of inline text.
 * The tooltip lives on a wrapper, so it still explains a disabled button. Props and ref go to the
 * button itself, which keeps it usable as a Radix `asChild` trigger.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(({
  label, tooltip, icon, badge, side = 'bottom', align = 'center', wrapperClassName, className,
  variant = 'outline', size = 'icon', ...props
}, ref) => (
  <span className={cn('group/tip relative inline-flex shrink-0', wrapperClassName)}>
    <Button
      ref={ref}
      type="button"
      variant={variant}
      size={size}
      aria-label={label}
      className={cn('size-8 [&_svg]:size-4', badge != null && 'w-auto gap-1.5 px-2.5', className)}
      {...props}
    >
      {icon}
      {badge != null ? <span aria-hidden="true" className="text-xs tabular-nums">{badge}</span> : null}
    </Button>
    <span
      role="tooltip"
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute z-50 w-max max-w-64 rounded-md border border-border bg-popover px-2 py-1 text-left text-xs font-normal normal-case leading-5 tracking-normal text-popover-foreground shadow-md',
        sideClass[side],
        side === 'top' || side === 'bottom' ? alignClass[align] : null,
        'invisible opacity-0 transition-opacity duration-150 motion-reduce:transition-none',
        'group-hover/tip:visible group-hover/tip:opacity-100 group-hover/tip:delay-300 group-has-[:focus-visible]/tip:visible group-has-[:focus-visible]/tip:opacity-100',
        '[@media(hover:none)]:hidden',
      )}
    >{tooltip ?? label}</span>
  </span>
));
IconButton.displayName = 'IconButton';
