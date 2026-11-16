import { z } from 'zod';

export const ROADMAP_ALERT_KINDS = [
  'sync_errors',
  'sync_conflicts',
  'import_failing',
  'azure_auth',
  'webhook_silent',
] as const;

export type RoadmapAlertKind = (typeof ROADMAP_ALERT_KINDS)[number];

export type RoadmapAlertResolution = 'fixed' | 'obsolete';

/** Live figures of an alert; which fields are set depends on the alert kind. */
export interface RoadmapAlertDetails {
  count?: number;
  httpStatus?: number;
  error?: string;
}

export interface RoadmapNotificationDto {
  id: string;
  kind: RoadmapAlertKind;
  projectId: string | null;
  projectName: string | null;
  title: string;
  body: string | null;
  /** Relative URL inside the web application. */
  link: string;
  createdAt: string;
  readAt: string | null;
  /** The problem of this episode is still open. */
  active: boolean;
  resolution: RoadmapAlertResolution | null;
  /** Current figures of the problem while the episode is active. */
  current: RoadmapAlertDetails | null;
  /** Count when this episode opened; null when unknown (opened before the journal). */
  openedCount: number | null;
}

export interface RoadmapNotificationPage {
  items: RoadmapNotificationDto[];
  nextCursor: string | null;
}

export interface RoadmapNotificationSummary {
  unread: number;
  activeUnread: number;
  /** Admins and project planners may open the sync problems page. */
  canViewSyncProblems: boolean;
}

export const roadmapNotificationListQuerySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});
