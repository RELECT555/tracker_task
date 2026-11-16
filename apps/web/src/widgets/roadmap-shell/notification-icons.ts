import { CircleAlert, CloudOff, GitCompareArrows, KeyRound, Webhook, type LucideIcon } from 'lucide-react';
import type { RoadmapAlertKind } from '@tracker/shared';

/** One icon per sync problem kind, shared by the popover and the sync problems page. */
export const ALERT_KIND_ICON: Record<RoadmapAlertKind, LucideIcon> = {
  sync_errors: CircleAlert,
  sync_conflicts: GitCompareArrows,
  import_failing: CloudOff,
  azure_auth: KeyRound,
  webhook_silent: Webhook,
};
