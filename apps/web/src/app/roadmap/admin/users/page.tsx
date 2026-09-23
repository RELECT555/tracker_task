import { AuthGuard } from '@/features/auth/ui/AuthGuard';
import { AdminGuard } from '@/features/auth/ui/AdminGuard';
import { RoadmapFrame } from '@/widgets/roadmap-shell/RoadmapFrame';
import { RoadmapUsersPage } from '@/views/roadmap-admin/ui/RoadmapUsersPage';

export default function Page() {
  return <AuthGuard><AdminGuard><RoadmapFrame><RoadmapUsersPage /></RoadmapFrame></AdminGuard></AuthGuard>;
}
