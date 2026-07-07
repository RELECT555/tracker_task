import { Sidebar } from '@/widgets/sidebar/Sidebar';
import { Header } from '@/widgets/header/Header';
import { PageContainer } from '@/shared/ui/page-container';

export function DashboardShell({
  title,
  description,
  titleAs,
  containerClassName,
  children,
}: {
  title: string;
  description?: string;
  titleAs?: 'h1' | 'p';
  containerClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-sidebar dark:bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tl-2xl border-l border-t border-border bg-background shadow-[inset_1px_0_0_hsl(var(--border)/0.5)] dark:rounded-none dark:border-t-0 dark:border-l-border/20 dark:shadow-none">
        <Header title={title} description={description} titleAs={titleAs} />
        <main className="flex-1 overflow-y-auto py-6">
          <PageContainer className={containerClassName}>{children}</PageContainer>
        </main>
      </div>
    </div>
  );
}
