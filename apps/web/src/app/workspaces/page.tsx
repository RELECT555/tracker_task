import { AuthGuard } from '@/features/auth/ui/AuthGuard';
import { WorkspacePickerPage } from '@/views/workspaces/ui/WorkspacePickerPage';

export default function Page() {
  return (
    <AuthGuard>
      <WorkspacePickerPage />
    </AuthGuard>
  );
}
