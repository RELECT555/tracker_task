import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

/** Общая обёртка страниц администрирования. */
export function AdminPage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <main className="roadmap-scrollbar relative min-h-0 flex-1 overflow-auto overscroll-none px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className={cn('space-y-6', className)}>{children}</div>
    </main>
  );
}

export function AdminPageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        {description ? <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function AdminAlert({ tone, children }: { tone: 'error' | 'success'; children: React.ReactNode }) {
  const Icon = tone === 'error' ? AlertCircle : CheckCircle2;
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-xl border px-4 py-3 text-sm leading-5',
        tone === 'error' ? 'border-border bg-card text-foreground' : 'border-emerald-500/25 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300',
      )}
    >
      <Icon aria-hidden="true" className={cn('mt-0.5 size-4 shrink-0', tone === 'error' && 'text-destructive')} />
      <div className="min-w-0 wrap-anywhere">{children}</div>
    </div>
  );
}

export function AdminCard({ title, titleProps, description, icon, badge, children, className }: {
  title: string;
  titleProps?: Pick<React.ComponentPropsWithoutRef<'h2'>, 'tabIndex'>;
  description?: string;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('overflow-hidden rounded-xl border border-border bg-card shadow-[0_1px_2px_hsl(var(--foreground)/0.04)] dark:shadow-none', className)}>
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</span> : null}
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground" {...titleProps}>{title}</h2>
            {description ? <p className="mt-0.5 text-sm text-muted-foreground">{description}</p> : null}
          </div>
        </div>
        {badge}
      </div>
      {children}
    </section>
  );
}

export function StatusPill({ active, label }: { active: boolean; label: string }) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium', active ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground')}>
      <span className={cn('h-1.5 w-1.5 rounded-full', active ? 'bg-emerald-500' : 'bg-muted-foreground/50')} />
      {label}
    </span>
  );
}
