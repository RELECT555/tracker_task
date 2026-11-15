'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DEFAULT_ROADMAP_TABLE_PREFERENCES, roadmapTablePreferencesSchema, type RoadmapTablePreferences } from '@tracker/shared';
import { apiFetch, ApiError } from '@/shared/api/client';
import { getSessionId } from '@/shared/lib/auth-storage';
import { columnWidthsStorageKey, readColumnWidths, resolveColumnWidth, type ColumnWidthConfig } from './roadmap-column-widths';

type Response = { preferences: RoadmapTablePreferences | null };
type Draft = { userId: string; sessionId: string | null; revision: number; preferences: RoadmapTablePreferences };
type Loaded = { preferences: RoadmapTablePreferences; sessionId: string | null };
const endpoint = '/roadmap/preferences/table';
const keyFor = (userId: string | null | undefined, sessionId: string | null) => ['roadmap', 'table-preferences', userId, sessionId] as const;
const draftKey = (userId: string) => `tracker.roadmap.table-draft.v1:${encodeURIComponent(userId)}`;

function subscribeSession(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (!event.key || event.key === 'tracker.sessionId' || event.key === 'tracker.accessToken') notify();
  };
  window.addEventListener('storage', onStorage);
  return () => window.removeEventListener('storage', onStorage);
}

function readDraft(userId: string, sessionId: string | null): Draft | null {
  try {
    const pending = JSON.parse(window.sessionStorage.getItem(draftKey(userId)) ?? 'null') as Draft | null;
    const parsed = roadmapTablePreferencesSchema.safeParse(pending?.preferences);
    return pending?.userId === userId && pending.sessionId === sessionId && Number.isSafeInteger(pending.revision) && pending.revision >= 0 && parsed.success
      ? { ...pending, preferences: parsed.data } : null;
  } catch { return null; }
}

function storeDraft(pending: Draft) {
  try { window.sessionStorage.setItem(draftKey(pending.userId), JSON.stringify(pending)); } catch { /* Saving to the account still works without browser storage. */ }
}

function legacyWidths(userId: string): Record<string, number> {
  try {
    const widths = readColumnWidths(window.localStorage, columnWidthsStorageKey(userId));
    return Object.fromEntries(Object.entries(widths).filter(([id, width]) => id.length > 0 && id.length <= 160 && !['__proto__', 'constructor', 'prototype'].includes(id) && width >= 80 && width <= 2400).slice(0, 500));
  } catch {
    return {};
  }
}

export function useRoadmapTablePreferences(userId: string | null | undefined) {
  const queryClient = useQueryClient();
  const sessionId = useSyncExternalStore(subscribeSession, getSessionId, () => null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const draftRef = useRef<Draft | null>(null);
  const revision = useRef(0);
  const submitted = useRef<Draft | null>(null);
  const [failure, setFailure] = useState<{ userId: string; revision: number } | null>(null);
  const query = useQuery({
    queryKey: keyFor(userId, sessionId),
    enabled: Boolean(userId && sessionId),
    queryFn: async ({ signal }): Promise<Loaded> => {
      // Another tab may have changed the login before useAuth has refreshed this page.
      const identity = await apiFetch<{ user: { id: string } }>('/auth/me', { signal });
      if (identity.user.id !== userId || getSessionId() !== sessionId) {
        void queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
        throw new ApiError('Session changed', 'SESSION_CHANGED', 401);
      }
      const result = await apiFetch<Response>(endpoint, { signal });
      return {
        sessionId,
        preferences: roadmapTablePreferencesSchema.parse(result.preferences ?? {
          ...DEFAULT_ROADMAP_TABLE_PREFERENCES,
          columnWidths: legacyWidths(userId!),
        }),
      };
    },
    staleTime: 60_000,
    retry: false,
  });
  const mutation = useMutation({
    // A slow earlier request must finish before a newer snapshot is written.
    scope: { id: `roadmap-table-preferences:${userId}` },
    mutationFn: async (pending: Draft) => {
      if (getSessionId() !== pending.sessionId) throw new ApiError('Session changed', 'SESSION_CHANGED', 401);
      const body = JSON.stringify(pending.preferences);
      return apiFetch<Response>(endpoint, { method: 'PUT', body, keepalive: new TextEncoder().encode(body).length < 60_000 });
    },
    onSuccess: (result, pending) => {
      queryClient.setQueryData(keyFor(pending.userId, pending.sessionId), { sessionId: pending.sessionId, preferences: result.preferences ?? DEFAULT_ROADMAP_TABLE_PREFERENCES } satisfies Loaded);
      const persisted = readDraft(pending.userId, pending.sessionId);
      if (persisted?.revision === pending.revision) {
        try { window.sessionStorage.removeItem(draftKey(pending.userId)); } catch { /* optional local recovery */ }
      }
      if (draftRef.current?.userId === pending.userId && draftRef.current.sessionId === pending.sessionId && draftRef.current.revision === pending.revision) {
        draftRef.current = null;
        setDraft(null);
        setFailure(null);
      }
    },
    onError: (_error, pending) => {
      if (draftRef.current?.userId === pending.userId && draftRef.current.sessionId === pending.sessionId && draftRef.current.revision === pending.revision) {
        setFailure({ userId: pending.userId, revision: pending.revision });
      }
    },
  });
  const { mutate } = mutation;
  const mutateRef = useRef(mutate);
  useEffect(() => { mutateRef.current = mutate; }, [mutate]);

  useEffect(() => {
    if (!userId || !query.data || query.data.sessionId !== sessionId || (draftRef.current?.userId === userId && draftRef.current.sessionId === sessionId)) return;
    const pending = readDraft(userId, sessionId);
    if (!pending) return;
    const restored = { ...pending, revision: revision.current = Math.max(revision.current, pending.revision) + 1 };
    draftRef.current = restored;
    storeDraft(restored);
    setDraft(restored);
    setFailure(null);
  }, [userId, sessionId, query.data]);

  useEffect(() => {
    if (!draft || draft.userId !== userId || draft.sessionId !== sessionId || failure?.revision === draft.revision || submitted.current === draft) return;
    const timer = window.setTimeout(() => { submitted.current = draft; mutate(draft); }, 450);
    return () => window.clearTimeout(timer);
  }, [draft, userId, sessionId, failure, mutate]);

  useEffect(() => {
    const flush = () => {
      const pending = draftRef.current;
      if (pending && pending !== submitted.current && pending.sessionId === getSessionId()) {
        submitted.current = pending;
        mutateRef.current(pending);
      }
    };
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
      flush();
    };
  }, []);

  const activeDraft = draft && draft.userId === userId && draft.sessionId === sessionId ? draft : null;
  const preferences = activeDraft?.preferences ?? query.data?.preferences ?? DEFAULT_ROADMAP_TABLE_PREFERENCES;
  const ready = Boolean(userId && sessionId && query.isSuccess && query.data?.sessionId === sessionId);
  const change = (patch: Partial<RoadmapTablePreferences>) => {
    if (!userId || !ready || sessionId !== getSessionId()) return;
    void queryClient.cancelQueries({ queryKey: keyFor(userId, sessionId) });
    const previous = draftRef.current?.userId === userId && draftRef.current.sessionId === sessionId ? draftRef.current.preferences : query.data?.preferences ?? DEFAULT_ROADMAP_TABLE_PREFERENCES;
    const next: Draft = {
      userId,
      sessionId,
      revision: ++revision.current,
      preferences: roadmapTablePreferencesSchema.parse({ ...previous, ...patch }),
    };
    draftRef.current = next;
    storeDraft(next);
    setDraft(next);
    setFailure(null);
  };
  const retry = async () => {
    if (query.isError || !ready) {
      const loaded = await query.refetch();
      if (loaded.isError) return;
    }
    const pending = draftRef.current;
    if (pending?.userId === userId && pending?.sessionId === getSessionId()) {
      setFailure(null);
      submitted.current = pending;
      mutate(pending);
    }
  };
  const reset = () => {
    change({ ...DEFAULT_ROADMAP_TABLE_PREFERENCES, columnWidths: {} });
    try { if (userId) window.localStorage.removeItem(columnWidthsStorageKey(userId)!); } catch { /* optional legacy storage */ }
  };
  const currentFailure = failure && failure.userId === userId && failure.revision === activeDraft?.revision;
  const status: 'loading' | 'saving' | 'saved' | 'error' = query.isError || currentFailure ? 'error'
    : !ready ? 'loading'
      : activeDraft ? 'saving' : 'saved';
  const widths = preferences.columnWidths;

  return {
    preferences, change, reset, retry, status, ready,
    columnWidths: {
      getWidth: (id: string, config: ColumnWidthConfig) => resolveColumnWidth(widths[id], config),
      hasCustomWidth: (id: string) => Object.hasOwn(widths, id),
      hasCustomWidths: Object.keys(widths).length > 0,
      commitWidth: (id: string, width: number, config: ColumnWidthConfig) => {
        if (!Number.isFinite(width)) return;
        const currentDraft = draftRef.current;
        const current = currentDraft && currentDraft.userId === userId && currentDraft.sessionId === sessionId ? currentDraft.preferences.columnWidths : widths;
        // Keep a bounded set of recent overrides even after visiting many projects.
        const recent = Object.entries(current).filter(([key]) => key !== id).slice(-499);
        change({ columnWidths: Object.fromEntries([...recent, [id, Math.min(2400, resolveColumnWidth(width, config))]]) });
      },
      resetWidths: () => change({ columnWidths: {} }),
    },
  };
}
