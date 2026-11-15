'use client';

import Link, { useLinkStatus } from 'next/link';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { ArrowDown, ArrowRight, ChartNoAxesCombined, GitBranch, Layers3 } from 'lucide-react';
import { isAdminUser } from '@/features/auth/lib/is-admin';
import { useAuth } from '@/features/auth/model/useAuth';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import type { AzureProject } from '@/entities/roadmap/api/roadmapApi';
import { resolveRoadmapProject, useRoadmapProject } from '@/entities/roadmap/model/roadmap-project-selection';
import styles from './home.module.css';

const EMPTY_PROJECTS: AzureProject[] = [];

function PlanLinkLabel() {
  const { pending } = useLinkStatus();
  return <span role="status">{pending ? 'Открываем план…' : 'Открыть план'}</span>;
}

export function HomePage() {
  const { user } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { savedProject: { projectId, roadmapId }, isAllProjects, ready } = useRoadmapProject(EMPTY_PROJECTS, { allowAll: true });
  useEffect(() => {
    if (!ready || !window.matchMedia('(width < 48rem)').matches) return;

    let active = true;
    void Promise.all([import('@/entities/roadmap/api/roadmapApi'), import('@/entities/roadmap/api/roadmapDemo')]).then(async ([{ roadmapApi }, { isRoadmapDemoMode }]) => {
      if (!active) return;
      const prefetchPlan = (id: string) => queryClient.prefetchQuery({
        queryKey: ['roadmap', 'plan', id],
        queryFn: () => roadmapApi.plan(id),
      });
      if (roadmapId && !isAllProjects) void prefetchPlan(roadmapId);
      const azure = {
        queryKey: ['roadmap', 'azure-projects'],
        queryFn: roadmapApi.projects,
      };
      const preferLocal = !isAllProjects && isAdminUser(user) && !isRoadmapDemoMode();
      if (preferLocal) void queryClient.prefetchQuery(azure);
      const { data } = await (preferLocal
        ? queryClient.fetchQuery({ queryKey: ['roadmap', 'local-projects'], queryFn: roadmapApi.localProjects })
          .catch(() => queryClient.fetchQuery(azure))
        : queryClient.fetchQuery(azure));
      if (!active || isAllProjects) return;
      const localId = resolveRoadmapProject(data, projectId)?.roadmapId;
      if (localId && localId !== roadmapId) void prefetchPlan(localId);
    }).catch(() => {
      // The Plan route owns its loading and retry states.
    });
    return () => { active = false; };
  }, [isAllProjects, projectId, queryClient, ready, roadmapId, user]);

  const features = [
    {
      title: 'Планируйте квартал',
      description: 'Соберите эпики и фичи, назначьте участников и оцените работу в часах.',
      href: routes.roadmap,
      icon: Layers3,
    },
    {
      title: 'Следите за загрузкой',
      description: 'Смотрите, как распределены часы по ролям и где факт расходится с планом.',
      href: routes.roadmapAnalytics,
      icon: ChartNoAxesCombined,
    },
    {
      title: 'Работайте с Azure DevOps',
      description: 'Импортируйте проекты и задачи из Azure DevOps в единый план.',
      href: isAdminUser(user) ? routes.roadmapAdmin : undefined,
      icon: GitBranch,
    },
  ];

  return (
    <main className={cn(styles.page, 'roadmap-scrollbar min-h-0 flex-1 overflow-auto px-4 py-5 sm:px-6 sm:py-7 lg:px-8')}>
      <section className={styles.hero} aria-labelledby="roadmap-heading">
        <div className={styles.heroContent}>
          <h1 id="roadmap-heading">У проекта есть <span>маршрут.</span></h1>
          <p>Планируйте работу команды на квартал, распределяйте нагрузку и сверяйте план с фактом.</p>
          <div className={styles.actions}>
            <Link href={routes.roadmap} className={styles.primary} aria-label="Открыть план" onNavigate={() => {
              if (window.matchMedia('(width < 48rem)').matches) router.prefetch(routes.roadmapAnalytics);
            }}>
              <PlanLinkLabel /> <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <a href="#roadmap-features" className={styles.secondary}>
              Возможности <ArrowDown aria-hidden="true" className="size-4" />
            </a>
          </div>
        </div>
      </section>
      <section id="roadmap-features" className={styles.features} aria-labelledby="roadmap-features-title">
        <h2 id="roadmap-features-title">Возможности Roadmap</h2>
        <ul>
          {features.map(({ title, description, href, icon: Icon }) => {
            const content = (
              <>
                <span className={styles.featureIcon}><Icon aria-hidden="true" className="size-5" /></span>
                <div>
                  <h3>{title}</h3>
                  <p>{description}</p>
                </div>
                {href ? <ArrowRight aria-hidden="true" className={styles.featureArrow} /> : null}
              </>
            );
            return (
              <li key={title}>
                {href ? <Link href={href} prefetch={href === routes.roadmap ? undefined : false} className={styles.feature}>{content}</Link>
                  : <div className={styles.feature}>{content}</div>}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
