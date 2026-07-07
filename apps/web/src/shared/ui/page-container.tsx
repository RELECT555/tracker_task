import { cn } from '@/shared/lib/utils';

export function PageContainer({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full animate-in px-4 fade-in slide-in-from-bottom-2 duration-500 md:px-6 lg:px-8',
        className ?? 'max-w-7xl',
      )}
    >
      {children}
    </div>
  );
}
