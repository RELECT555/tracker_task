import { createElement, lazy, Suspense, type ComponentType, type ReactNode } from 'react';

type DynamicOptions = { loading?: () => ReactNode };

/** Аналог next/dynamic: ленивая загрузка компонента с fallback на время загрузки. */
export function dynamic<P extends object>(
  loader: () => Promise<ComponentType<P>>,
  options: DynamicOptions = {},
): ComponentType<P> {
  const LazyComponent = lazy(async () => ({ default: await loader() }));
  return function DynamicComponent(props: P) {
    return (
      <Suspense fallback={options.loading?.() ?? null}>
        {createElement(LazyComponent as ComponentType<P>, props)}
      </Suspense>
    );
  };
}
