import { AuthGuard } from '@/features/auth/ui/AuthGuard';
import { RoadmapFrame } from '@/widgets/roadmap-shell/RoadmapFrame';
import { RoadmapAnalyticsPage } from '@/views/roadmap-analytics/ui/RoadmapAnalyticsPage';

export default function Page() {
  return (
    <AuthGuard>
      <RoadmapFrame>
        <RoadmapAnalyticsPage />
      </RoadmapFrame>
    </AuthGuard>
  );
}
