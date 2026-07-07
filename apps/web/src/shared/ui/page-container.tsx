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
        'mx-auto w-full max-w-7xl animate-in fade-in slide-in-from-bottom-2 duration-500',
        className,
      )}
    >
      {children}
    </div>
  );
}
