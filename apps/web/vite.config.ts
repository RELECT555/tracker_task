import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // Проксируем API через dev-сервер, чтобы фронт и бэк жили на одном origin
  // (нужно для демо-стенда через туннель). Работает, когда VITE_API_URL задан
  // относительным путём (/api/v1).
  const apiOrigin = env.API_PROXY_ORIGIN ?? 'http://localhost:3001';

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        // shared собран в CommonJS (dist), Rollup не видит его именованные экспорты.
        // Берём исходники напрямую: заодно не нужен tsc --watch для пакета в dev.
        '@tracker/shared': path.resolve(__dirname, '../../packages/shared/src/index.ts'),
      },
    },
    server: {
      // Слушаем на всех интерфейсах (как это делал next dev): иначе localhost
      // не открывается из IPv4 и не работает проброс портов в удалённых воркспейсах.
      host: true,
      port: 3000,
      strictPort: true,
      proxy: {
        '/api/v1': { target: apiOrigin, changeOrigin: true },
      },
    },
    preview: { port: 3000 },
    build: { outDir: 'dist', sourcemap: false },
  };
});
