import { AuthGuard } from '@/features/auth/ui/AuthGuard';
import { AdminGuard } from '@/features/auth/ui/AdminGuard';
import { RoadmapFrame } from '@/widgets/roadmap-shell/RoadmapFrame';
import { RoadmapRolesPage } from '@/views/roadmap-admin/ui/RoadmapRolesPage';

export default function Page() {
  return <AuthGuard><AdminGuard><RoadmapFrame><RoadmapRolesPage /></RoadmapFrame></AdminGuard></AuthGuard>;
}
