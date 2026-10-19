import type { NextConfig } from 'next';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants';

const apiOrigin = process.env.API_PROXY_ORIGIN ?? 'http://localhost:3001';

const nextConfig = (phase: string): NextConfig => ({
  // Dev-сервер пишет в отдельную папку, чтобы `next build` не перетирал его
  // манифесты (иначе запущенный `npm run dev` начинает отдавать 500 / ENOENT).
  distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
  transpilePackages: ['@tracker/shared'],
  // Проксируем API через Next, чтобы фронт и бэк жили на одном origin.
  // Нужно для доступа извне (туннель/демо-стенд): браузер клиента не может
  // достучаться до localhost:3001 на машине, где всё запущено.
  // Активируется, когда NEXT_PUBLIC_API_URL задан относительным путём.
  async rewrites() {
    return [
      {
        source: '/api/v1/:path*',
        destination: `${apiOrigin}/api/v1/:path*`,
      },
    ];
  },
});

export default nextConfig;
