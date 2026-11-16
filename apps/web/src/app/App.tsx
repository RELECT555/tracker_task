import { lazy, Suspense, useEffect, type ComponentType, type ReactNode } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router';
import { AdminGuard } from '@/features/auth/ui/AdminGuard';
import { AuthGuard } from '@/features/auth/ui/AuthGuard';
import { RoadmapFrame } from '@/widgets/roadmap-shell/RoadmapFrame';
import { RoadmapFrameSkeleton } from '@/widgets/roadmap-shell/RoadmapFrameSkeleton';
import { routes } from '@/shared/config/routes';

// Каждая страница — отдельный чанк, как раньше в Next (разделение кода по роутам).
const page = <K extends string>(loader: () => Promise<Record<K, ComponentType>>, key: K) =>
  lazy(async () => ({ default: (await loader())[key] }));

const HomePage = page(() => import('@/views/home/ui/HomePage'), 'HomePage');
const LoginPage = page(() => import('@/views/login/ui/LoginPage'), 'LoginPage');
const RoadmapPage = page(() => import('@/views/roadmap/ui/RoadmapPage'), 'RoadmapPage');
const SyncProblemsPage = page(() => import('@/views/roadmap-sync/ui/SyncProblemsPage'), 'SyncProblemsPage');
const CapacityPage = page(() => import('@/views/roadmap-analytics/ui/CapacityPage'), 'RoadmapCapacityPage');
const ProgressPage = page(() => import('@/views/roadmap-analytics/ui/ProgressPage'), 'RoadmapProgressPage');
const AdminHomePage = page(() => import('@/views/roadmap-admin/ui/RoadmapAdminHomePage'), 'RoadmapAdminHomePage');
const IntegrationsPage = page(() => import('@/views/roadmap-admin/ui/RoadmapIntegrationsPage'), 'RoadmapIntegrationsPage');
const UsersPage = page(() => import('@/views/roadmap-admin/ui/RoadmapUsersPage'), 'RoadmapUsersPage');
const RolesPage = page(() => import('@/views/roadmap-admin/ui/RoadmapRolesPage'), 'RoadmapRolesRoute');
const AccessPage = page(() => import('@/views/roadmap-admin/ui/RoadmapProjectAccessPage'), 'RoadmapProjectAccessPage');

function Title({ title, children }: { title: string; children: ReactNode }) {
  useEffect(() => {
    document.title = title;
  }, [title]);
  return <>{children}</>;
}

function WorkspaceLayout() {
  return (
    <AuthGuard fallback={<RoadmapFrameSkeleton />}>
      <RoadmapFrame>
        <Suspense fallback={null}>
          <Outlet />
        </Suspense>
      </RoadmapFrame>
    </AuthGuard>
  );
}

function AdminLayout() {
  return (
    <AdminGuard>
      <Outlet />
    </AdminGuard>
  );
}

export function App() {
  return (
    <Routes>
      <Route
        path={routes.login}
        element={
          <Title title="Roadmap">
            <Suspense
              fallback={
                <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
                  Загрузка…
                </div>
              }
            >
              <LoginPage />
            </Suspense>
          </Title>
        }
      />
      <Route element={<WorkspaceLayout />}>
        <Route index element={<Title title="Главная · Roadmap"><HomePage /></Title>} />
        <Route path="roadmap" element={<RoadmapPage />} />
        <Route path="roadmap/sync" element={<SyncProblemsPage />} />
        <Route path="roadmap/analytics" element={<CapacityPage />} />
        <Route path="roadmap/analytics/progress" element={<ProgressPage />} />
        <Route path="roadmap/admin" element={<AdminLayout />}>
          <Route index element={<AdminHomePage />} />
          <Route path="integrations" element={<IntegrationsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="access" element={<AccessPage />} />
        </Route>
      </Route>
      <Route path="workspaces" element={<Navigate to={routes.roadmap} replace />} />
      <Route path="*" element={<Navigate to={routes.home} replace />} />
    </Routes>
  );
}
