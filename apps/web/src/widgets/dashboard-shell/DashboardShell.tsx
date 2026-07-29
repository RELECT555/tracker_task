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
    <>
      <Header title={title} description={description} titleAs={titleAs} />
      <main className="flex-1 overflow-y-auto py-6">
        <PageContainer className={containerClassName}>{children}</PageContainer>
      </main>
    </>
  );
}
