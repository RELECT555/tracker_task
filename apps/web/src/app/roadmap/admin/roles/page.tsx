import { RoadmapRolesPage } from '@/views/roadmap-admin/ui/RoadmapRolesPage';

export default async function Page({ searchParams }: { searchParams: Promise<{ projectId?: string | string[] }> }) {
  const { projectId } = await searchParams;
  const initialProjectId = typeof projectId === 'string' ? projectId : undefined;
  return <RoadmapRolesPage key={initialProjectId} initialProjectId={initialProjectId} />;
}
