import { routes } from '@/shared/config/routes';

export type TourStep = {
  /** Value of the `data-tour` attribute on the element to highlight */
  anchor: string;
  /** Page the anchor lives on; the tour navigates there before showing the step */
  route: string;
  title: string;
  text: string;
  /** Plan item on the welcome screen that this step completes */
  planStepId?: string;
};

/**
 * Shared steps — the tour walks the same path for everyone; admin-only screens
 * stay in the welcome plan, where they can be opened directly.
 */
export const TOUR_STEPS: TourStep[] = [
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
    planStepId: 'inbox',
  },
  {
    anchor: 'page-content',
    route: routes.newRequest,
    title: 'Запрос создаётся за один экран',
    text: 'Выберите тип — форма и маршрут согласования подставятся сами. Черновик можно сохранить и вернуться позже.',
    planStepId: 'create-request',
  },
  {
    anchor: 'page-content',
    route: routes.outbox,
    title: 'Свои запросы — здесь',
    text: 'Видно текущий шаг, ответственного и срок. Отсюда же запрос можно отозвать.',
    planStepId: 'outbox',
  },
  {
    anchor: 'notifications-bell',
    route: routes.inbox,
    title: 'Вас позовут, когда понадобитесь',
    text: 'Колокольчик подсвечивает шаги, где ждут именно вас — следить за чужими запросами не нужно.',
    planStepId: 'notifications',
  },
];
