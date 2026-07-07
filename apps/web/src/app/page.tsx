import { redirect } from 'next/navigation';
import { routes } from '@/shared/config/routes';

export default function HomePage() {
  redirect(routes.inbox);
}
