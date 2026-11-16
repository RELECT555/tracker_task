import { forwardRef, type AnchorHTMLAttributes, type MouseEvent } from 'react';
import { Link as RouterLink } from 'react-router';

type LinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> & {
  href: string;
  replace?: boolean;
  scroll?: boolean;
  /** Оставлено для совместимости с next/link: в SPA префетча страниц нет. */
  prefetch?: boolean;
  onNavigate?: () => void;
};

export const Link = forwardRef<HTMLAnchorElement, LinkProps>(function Link(
  { href, replace, prefetch: _prefetch, scroll: _scroll, onNavigate, onClick, ...rest },
  ref,
) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (!event.defaultPrevented) onNavigate?.();
  };
  return <RouterLink ref={ref} to={href} replace={replace} onClick={handleClick} {...rest} />;
});

export default Link;
