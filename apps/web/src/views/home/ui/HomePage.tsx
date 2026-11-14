'use client';

import Link from 'next/link';
import { ArrowDown, ArrowRight, ChartNoAxesCombined, GitBranch, Layers3 } from 'lucide-react';
import { isAdminUser } from '@/features/auth/lib/is-admin';
import { useAuth } from '@/features/auth/model/useAuth';
import { routes } from '@/shared/config/routes';
import { cn } from '@/shared/lib/utils';
import { RouteBoard } from './RouteBoard';
import styles from './home.module.css';

export function HomePage() {
  const { user } = useAuth();

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
            <Link href={routes.roadmap} className={styles.primary}>
              Открыть план <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
            <a href="#roadmap-features" className={styles.secondary}>
              Возможности <ArrowDown aria-hidden="true" className="size-4" />
            </a>
          </div>
        </div>
        <RouteBoard />
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
                {href ? <Link href={href} className={styles.feature}>{content}</Link>
                  : <div className={styles.feature}>{content}</div>}
              </li>
            );
          })}
        </ul>
      </section>
    </main>
  );
}
