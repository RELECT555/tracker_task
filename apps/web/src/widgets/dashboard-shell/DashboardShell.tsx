import { Sidebar } from '@/widgets/sidebar/Sidebar';
import { Header } from '@/widgets/header/Header';
import { PageContainer } from '@/shared/ui/page-container';

export function DashboardShell({
  title,
  description,
  containerClassName,
  children,
}: {
  title: string;
  description?: string;
  containerClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex h-screen overflow-hidden bg-sidebar dark:bg-background">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-tl-2xl border-l border-t border-border/50 bg-background shadow-[inset_1px_0_0_hsl(var(--border)/0.3)] dark:rounded-none dark:border-t-0 dark:border-l-border/20 dark:shadow-none">
        <Header title={title} description={description} />
        <main className="flex-1 overflow-y-auto px-4 py-6 md:px-6 lg:px-8">
          <PageContainer className={containerClassName}>{children}</PageContainer>
        </main>
      </div>
    </div>
  );
}
