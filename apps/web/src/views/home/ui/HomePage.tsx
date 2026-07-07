import { redirect } from 'next/navigation';
import { routes } from '@/shared/config/routes';

export function HomePage() {
  redirect(routes.inbox);
}
