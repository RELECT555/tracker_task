/** Dev seed personas — mirrors apps/api/prisma/seed.ts */

export const DEV_PASSWORD = 'tracker';

export const DEV_ACCOUNTS = [
  {
    email: 'employee@tracker.local',
    label: 'Сотрудник',
    name: 'Анна Кузнецова',
  },
  {
    email: 'employee2@tracker.local',
    label: 'Сотрудник 2',
    name: 'Игорь Петров',
  },
  {
    email: 'manager@tracker.local',
    label: 'Руководитель',
    name: 'Мария Соколова',
  },
  {
    email: 'director@tracker.local',
    label: 'Директор',
    name: 'Алексей Воронов',
  },
  {
    email: 'admin@tracker.local',
    label: 'Админ',
    name: 'Дмитрий Орлов',
  },
  {
    email: 'observer@tracker.local',
    label: 'Наблюдатель',
    name: 'Елена Морозова',
  },
] as const;
