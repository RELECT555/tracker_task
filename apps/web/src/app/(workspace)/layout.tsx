import { AuthGuard } from '@/features/auth/ui/AuthGuard';
import { RoadmapFrame } from '@/widgets/roadmap-shell/RoadmapFrame';
import { RoadmapFrameSkeleton } from '@/widgets/roadmap-shell/RoadmapFrameSkeleton';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard fallback={<RoadmapFrameSkeleton />}>
      <RoadmapFrame>{children}</RoadmapFrame>
    </AuthGuard>
  );
}
