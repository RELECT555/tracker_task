import { Cable, UserRoundCog, Users } from 'lucide-react';
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
    title: 'Роли',
    description: 'Каталог ролей и их назначение в командах проектов.',
    icon: UserRoundCog,
  },
] as const;
