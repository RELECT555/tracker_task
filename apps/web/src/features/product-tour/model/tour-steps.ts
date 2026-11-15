import { routes } from '@/shared/config/routes';

export type TourStep = {
  id: string;
  title: string;
  description: string;
  /** Страница, на которой показывается шаг. Если не задана, шаг остаётся на текущей. */
  route?: string;
  /** Значение атрибута data-tour у подсвечиваемого элемента. Без него карточка показывается по центру. */
  target?: string;
  /** Шаг видят только администраторы. */
  adminOnly?: boolean;
};

export const tourSteps: readonly TourStep[] = [
  {
    id: 'welcome',
    route: routes.home,
    title: 'Добро пожаловать в Roadmap',
    description: 'За минуту покажем, как спланировать квартал, распределить часы по ролям и сверить план с фактом из Azure DevOps.',
  },
  {
    id: 'navigation',
    route: routes.home,
    target: 'nav',
    title: 'Навигация',
    description: 'Основные разделы: «Главная», «План проекта» и «Аналитика». На широком экране боковую панель можно свернуть кнопкой в её шапке.',
  },
  {
    id: 'plan-project',
    route: routes.roadmap,
    target: 'plan-project',
    title: 'Выберите проект',
    description: 'Планирование идёт внутри одного проекта. Пункт «Все проекты» собирает сводную таблицу по всем доступным проектам.',
  },
  {
    id: 'plan-table',
    route: routes.roadmap,
    target: 'plan-table',
    title: 'Таблица плана',
    description: 'Эпики и фичи из Azure DevOps сгруппированы по иерархии. В ячейке роли назначьте участника и оцените часы: итоги по фиче и эпику считаются сами.',
  },
  {
    id: 'plan-roles',
    route: routes.roadmap,
    target: 'plan-roles',
    title: 'Столбцы по ролям',
    description: 'Включите «По ролям», чтобы видеть план и факт по каждой роли проекта. Фильтр «С планом» скрывает роли без оценок в выбранном периоде.',
  },
  {
    id: 'plan-period',
    route: routes.roadmap,
    target: 'plan-period',
    title: 'Квартал',
    description: 'Планирование квартальное: у каждого назначения свой квартал. Переключайте периоды стрелками, а работу на несколько кварталов разбивайте на отдельные назначения.',
  },
  {
    id: 'plan-focus',
    route: routes.roadmap,
    target: 'plan-focus',
    title: 'Режим фокуса',
    description: 'Разворачивает таблицу на весь экран, чтобы заполнять план без отвлекающих элементов. Выйти можно той же кнопкой или клавишей Esc.',
  },
  {
    id: 'analytics-tabs',
    route: routes.roadmapAnalytics,
    target: 'analytics-tabs',
    title: 'Аналитика',
    description: '«Загрузка квартала» показывает, как распределены часы по людям и ролям. «Прогресс проекта» сравнивает план с фактом.',
  },
  {
    id: 'admin',
    route: routes.roadmapAnalytics,
    target: 'nav-admin',
    adminOnly: true,
    title: 'Администрирование',
    description: 'Здесь подключается Azure DevOps, импортируются пользователи, настраиваются роли и выдаётся доступ к проектам. Начните с раздела «Интеграции».',
  },
  {
    id: 'theme',
    route: routes.roadmapAnalytics,
    target: 'theme',
    title: 'Тема оформления',
    description: 'Переключает светлую, тёмную и системную тему.',
  },
  {
    id: 'done',
    route: routes.roadmapAnalytics,
    target: 'tour-launcher',
    title: 'Готово',
    description: 'Тур всегда можно пройти снова: нажмите эту кнопку или «Тур по продукту» на главной.',
  },
];
