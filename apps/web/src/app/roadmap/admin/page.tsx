import { AuthGuard } from '@/features/auth/ui/AuthGuard';
import { AdminGuard } from '@/features/auth/ui/AdminGuard';
import { RoadmapFrame } from '@/widgets/roadmap-shell/RoadmapFrame';
import { RoadmapAdminHomePage } from '@/views/roadmap-admin/ui/RoadmapAdminHomePage';

export default function Page() {
  return <AuthGuard><AdminGuard><RoadmapFrame><RoadmapAdminHomePage /></RoadmapFrame></AdminGuard></AuthGuard>;
}
