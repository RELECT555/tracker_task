import type { TemplateContext } from '@tracker/shared';

/** Placeholders the title, description, tags and field texts understand; they match `renderSyncTemplate`. */
export const TEMPLATE_TOKENS = [
  { token: '{title}', chip: 'Название фичи', example: 'Заявки и маршрут согласования' },
  { token: '{role}', chip: 'Роль', example: 'Backend' },
  { token: '{quarter}', chip: 'Квартал', example: 'Q4 2026' },
  { token: '{quarterKey}', chip: 'Квартал (2026-Q4)', example: '2026-Q4' },
  { token: '{person}', chip: 'Участник', example: 'Иван Петров' },
  { token: '{personEmail}', chip: 'Email участника', example: 'ivan.petrov@example.test' },
  { token: '{id}', chip: 'Номер фичи', example: '1234' },
] as const;

/** Made-up allocation used for previews until a real one is picked. */
export const PREVIEW_CONTEXT: TemplateContext & { estimate: number; remaining: number; assignee: string; iterationPath: string; parentAreaPath: string } = {
  role: 'Backend',
  title: 'Заявки и маршрут согласования',
  quarterKey: '2026-Q4',
  person: 'Иван Петров',
  personEmail: 'ivan.petrov@example.test',
  id: '1234',
  estimate: 40,
  remaining: 40,
  assignee: 'ivan.petrov@example.test',
  iterationPath: 'Проект\\Q4 2026',
  parentAreaPath: 'Проект\\Команда',
  fields: { 'System.AreaPath': 'Проект\\Команда' },
};
