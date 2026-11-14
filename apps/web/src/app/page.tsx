import type { Metadata } from 'next';
import { AuthGuard } from '@/features/auth/ui/AuthGuard';
import { RoadmapFrame } from '@/widgets/roadmap-shell/RoadmapFrame';
import { HomePage } from '@/views/home/ui/HomePage';

export const metadata: Metadata = { title: 'Главная · Roadmap' };

export default function Page() {
  return <AuthGuard><RoadmapFrame><HomePage /></RoadmapFrame></AuthGuard>;
}
