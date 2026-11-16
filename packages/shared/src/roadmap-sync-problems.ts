import { z } from 'zod';
import type {
  RoadmapAlertDetails,
  RoadmapAlertKind,
  RoadmapAlertResolution,
} from './roadmap-notifications';

export type SyncProblemStatus = 'active' | 'fixed' | 'obsolete';

export interface SyncProblemAction {
  label: string;
  /** Relative URL inside the web application. */
  link: string;
}

/** One sync problem (alert key) with its latest episode. */
export interface SyncProblemDto {
  alertId: string;
  episodeId: string;
  kind: RoadmapAlertKind;
  projectId: string | null;
  projectName: string | null;
  title: string;
  body: string | null;
  status: SyncProblemStatus;
  openedAt: string;
  resolvedAt: string | null;
  peakCount: number | null;
  currentCount: number | null;
  /** Episodes of this key opened in the 7 days ending at the latest episode's opening. */
  recurrence7d: number;
  /** Earlier episodes of this key kept in the journal. */
  historyCount: number;
  hint: string;
  action: SyncProblemAction | null;
}

export interface SyncProblemEpisodeDto {
  episodeId: string;
  openedAt: string;
  resolvedAt: string | null;
  resolution: RoadmapAlertResolution | null;
  peakCount: number | null;
  details: RoadmapAlertDetails;
}

export interface SyncProblemPage {
  items: SyncProblemDto[];
  nextCursor: string | null;
  counts: { active: number };
  /** Projects this user may filter by. */
  projects: { id: string; name: string }[];
}

export interface SyncProblemHistory {
  items: SyncProblemEpisodeDto[];
}

export const SYNC_PROBLEM_STATUS_FILTERS = ['active', 'resolved', 'all'] as const;
export type SyncProblemStatusFilter = (typeof SYNC_PROBLEM_STATUS_FILTERS)[number];

export const syncProblemListQuerySchema = z.object({
  status: z.enum(SYNC_PROBLEM_STATUS_FILTERS).default('active'),
  projectId: z.string().uuid().optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(30),
});

export const syncProblemHistoryQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
