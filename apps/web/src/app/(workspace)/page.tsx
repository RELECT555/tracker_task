import type { Metadata } from 'next';
import { HomePage } from '@/views/home/ui/HomePage';

export const metadata: Metadata = { title: 'Главная · Roadmap' };

export default function Page() {
  return <HomePage />;
}
