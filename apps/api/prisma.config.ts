import { defineConfig, env } from 'prisma/config';

// Prisma 7 не читает .env сам: подгружаем его для локальной разработки.
// В контейнере и CI переменные приходят из окружения, файла там нет.
try {
  process.loadEnvFile('.env');
} catch {
  // .env нет — это нормально
}

// Конфиг для CLI: generate, migrate. Рантайм API подключается к БД через адаптер (см. prisma-adapter.ts).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DATABASE_URL') },
});
