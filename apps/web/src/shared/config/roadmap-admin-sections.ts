import { Cable, ShieldCheck, UserRoundCog, Users } from 'lucide-react';
import { routes } from './routes';

export const roadmapAdminSections = [
  {
    id: 'integrations',
    href: routes.roadmapAdmin,
    title: 'Интеграции',
    description: 'Подключение Azure DevOps и синхронизация проектов.',
    icon: Cable,
  },
  {
    id: 'users',
    href: routes.roadmapAdminUsers,
    title: 'Пользователи',
    description: 'Импорт сотрудников и управление их участием в планировании.',
    icon: Users,
  },
  {
    id: 'roles',
    href: routes.roadmapAdminRoles,
    title: 'Роли и участники',
    description: 'Участники и исполнители по умолчанию для ролей проекта.',
    icon: UserRoundCog,
  },
  {
    id: 'access',
    href: routes.roadmapAdminAccess,
    title: 'Доступ к проектам',
    description: 'Права просмотра и редактирования плана для сотрудников.',
    icon: ShieldCheck,
  },
] as const;
