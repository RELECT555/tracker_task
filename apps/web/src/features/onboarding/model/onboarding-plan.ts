import {
  Bell,
  ClipboardList,
  FileText,
  GitBranch,
  Inbox,
  ListChecks,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { routes } from '@/shared/config/routes';

/** One highlight inside a plan item's tour */
export type TourStop = {
  /** Value of the `data-tour` attribute on the element to highlight */
  anchor: string;
  /** Page the anchor lives on; the tour navigates there before showing it */
  route: string;
  title: string;
  text: string;
};

/**
 * A plan item is the unit of onboarding: a checklist row on the welcome screen
 * AND the tour segment that walks it. One definition, so progress can never
 * disagree between the two.
 */
export type PlanItem = {
  id: string;
  icon: LucideIcon;
  title: string;
  text: string;
  /** Where the row's link goes when the user prefers to look around alone */
  href: string;
  cta: string;
  tour: TourStop[];
};

const ITEMS = {
  inbox: {
    id: 'inbox',
    icon: Inbox,
    title: 'Разберите входящие',
    text: 'Запросы, которые ждут вашего решения, и сортировка по срокам.',
    href: routes.inbox,
    cta: 'Открыть входящие',
    tour: [
      {
        anchor: 'sidebar-nav',
        route: routes.inbox,
        title: 'Три рабочих раздела',
        text: 'Входящие — что ждёт вашего решения. Исходящие — ваши запросы. Уведомления — всё, что произошло, пока вас не было.',
      },
      {
        anchor: 'inbox-filters',
        route: routes.inbox,
        title: 'Сначала то, что горит',
        text: 'Сортировка по SLA поднимает наверх запросы с истекающим сроком. В архиве — то, что вы уже обработали.',
      },
    ],
  },
  'create-request': {
    id: 'create-request',
    icon: FileText,
    title: 'Создайте первый запрос',
    text: 'Выберите тип — маршрут согласования подставится сам.',
    href: routes.newRequest,
    cta: 'Создать запрос',
    tour: [
      {
        anchor: 'page-content',
        route: routes.newRequest,
        title: 'Запрос создаётся за один экран',
        text: 'Выберите тип — форма и маршрут подставятся сами. Черновик можно сохранить и вернуться позже.',
      },
    ],
  },
  outbox: {
    id: 'outbox',
    icon: ClipboardList,
    title: 'Следите за своими запросами',
    text: 'Текущий шаг, ответственный и срок по каждому запросу.',
    href: routes.outbox,
    cta: 'Открыть исходящие',
    tour: [
      {
        anchor: 'page-content',
        route: routes.outbox,
        title: 'Свои запросы — здесь',
        text: 'Видно текущий шаг, ответственного и срок. Отсюда же запрос можно отозвать.',
      },
    ],
  },
  notifications: {
    id: 'notifications',
    icon: Bell,
    title: 'Проверьте уведомления',
    text: 'Чтобы не пропустить шаг, где ждут именно вас.',
    href: routes.notifications,
    cta: 'К уведомлениям',
    tour: [
      {
        anchor: 'notifications-bell',
        route: routes.notifications,
        title: 'Вас позовут, когда понадобитесь',
        text: 'Колокольчик подсвечивает шаги, где ждут именно вас — следить за чужими запросами не нужно.',
      },
      {
        anchor: 'page-content',
        route: routes.notifications,
        title: 'История событий',
        text: 'Полный список того, что произошло по вашим и чужим запросам с вашим участием.',
      },
    ],
  },
  'request-types': {
    id: 'request-types',
    icon: ListChecks,
    title: 'Опишите типы запросов',
    text: 'Поля формы и правила заполнения — основа всего остального.',
    href: routes.admin.requestTypes,
    cta: 'К типам запросов',
    tour: [
      {
        anchor: 'page-content',
        route: routes.admin.requestTypes,
        title: 'С типа начинается запрос',
        text: 'Тип задаёт поля формы и маршрут по умолчанию. Пока типов нет, создать запрос не получится.',
      },
    ],
  },
  'route-templates': {
    id: 'route-templates',
    icon: GitBranch,
    title: 'Соберите маршрут согласования',
    text: 'Шаги, ответственные и SLA — на визуальном холсте.',
    href: routes.admin.routeTemplates,
    cta: 'К маршрутам',
    tour: [
      {
        anchor: 'page-content',
        route: routes.admin.routeTemplates,
        title: 'Маршрут собирается мышкой',
        text: 'Шаги на холсте, у каждого — ответственный и SLA. Параллельные согласования тоже здесь.',
      },
    ],
  },
  users: {
    id: 'users',
    icon: Users,
    title: 'Проверьте людей и подразделения',
    text: 'Роли и руководители определяют, кому уйдёт согласование.',
    href: routes.admin.users,
    cta: 'К пользователям',
    tour: [
      {
        anchor: 'page-content',
        route: routes.admin.users,
        title: 'Кому уйдёт согласование',
        text: 'Шаг маршрута может указывать на роль или на руководителя — поэтому важны роли и подразделения.',
      },
    ],
  },
} satisfies Record<string, PlanItem>;

export type PlanItemId = keyof typeof ITEMS;

export const PLAN_ITEMS: Record<string, PlanItem> = ITEMS;

const USER_PLAN_IDS: PlanItemId[] = ['inbox', 'create-request', 'outbox', 'notifications'];

const ADMIN_PLAN_IDS: PlanItemId[] = [
  'request-types',
  'route-templates',
  'users',
  'create-request',
];

export function getPlanIds(isAdmin: boolean): string[] {
  return isAdmin ? ADMIN_PLAN_IDS : USER_PLAN_IDS;
}

export function getPlan(isAdmin: boolean): PlanItem[] {
  return getPlanIds(isAdmin).map((id) => PLAN_ITEMS[id]);
}

/** Flattens a run of plan items into the stops the overlay walks through. */
export type TourQueueStop = TourStop & {
  itemId: string;
  itemTitle: string;
  /** True when this is the last stop of its item — completing it ticks the row */
  isItemEnd: boolean;
};

export function buildTourQueue(itemIds: string[]): TourQueueStop[] {
  return itemIds.flatMap((itemId) => {
    const item = PLAN_ITEMS[itemId];
    if (!item) return [];
    return item.tour.map((stop, index) => ({
      ...stop,
      itemId,
      itemTitle: item.title,
      isItemEnd: index === item.tour.length - 1,
    }));
  });
}
