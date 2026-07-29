/** Dev seed personas — mirrors apps/api/prisma/seed.ts */

export const DEV_PASSWORD = 'tracker';

export const DEV_ACCOUNTS = [
  {
    email: 'employee@tracker.local',
    label: 'Сотрудник',
    name: 'Анна Кузнецова',
    hint: 'создание запросов',
  },
  {
    email: 'employee2@tracker.local',
    label: 'Сотрудник 2',
    name: 'Игорь Петров',
    hint: 'второй автор / peer',
  },
  {
    email: 'manager@tracker.local',
    label: 'Руководитель',
    name: 'Мария Соколова',
    hint: 'inbox / согласование',
  },
  {
    email: 'director@tracker.local',
    label: 'Директор',
    name: 'Алексей Воронов',
    hint: 'эскалации',
  },
  {
    email: 'admin@tracker.local',
    label: 'Админ',
    name: 'Дмитрий Орлов',
    hint: 'настройки',
  },
  {
    email: 'observer@tracker.local',
    label: 'Наблюдатель',
    name: 'Елена Морозова',
    hint: 'только чтение',
  },
] as const;

export type DevAccount = (typeof DEV_ACCOUNTS)[number];
