import { AuthGuard } from '@/features/auth/ui/AuthGuard';
import { RoadmapFrame } from '@/widgets/roadmap-shell/RoadmapFrame';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <RoadmapFrame>{children}</RoadmapFrame>
    </AuthGuard>
  );
}
