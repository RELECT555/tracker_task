'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { SyncSettingsV2 } from '@tracker/shared';
import { roadmapApi, type RoadmapAzureField, type RoadmapWriteBackOverview } from '@/entities/roadmap/api/roadmapApi';

const SETTINGS_KEY = ['roadmap', 'sync-settings-v2'];

function pick<K extends keyof SyncSettingsV2>(settings: SyncSettingsV2, keys: readonly K[]) {
  return Object.fromEntries(keys.map((key) => [key, settings[key]])) as Pick<SyncSettingsV2, K>;
}

/**
 * Edits one slice of the sync settings. Every section of the integration page owns its own keys and saves
 * them over the latest copy from the server, so saving one section never overwrites another section's edits.
 */
export function useSyncSettingsEditor<K extends keyof SyncSettingsV2>(keys: readonly K[]) {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: SETTINGS_KEY, queryFn: roadmapApi.syncSettingsV2 });
  const server = query.data ? pick(query.data, keys) : null;
  const [draft, setDraft] = useState<Pick<SyncSettingsV2, K> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const previous = useRef<Pick<SyncSettingsV2, K> | null>(null);

  useEffect(() => {
    if (!server) return;
    const before = previous.current;
    previous.current = server;
    setDraft((current) => !current || JSON.stringify(current) === JSON.stringify(before) ? server : current);
    // `server` is a fresh object on every render; the JSON key keeps this effect tied to its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(server)]);

  const saveMutation = useMutation({
    mutationFn: async (value: Pick<SyncSettingsV2, K>) => {
      const latest = await queryClient.fetchQuery({ queryKey: SETTINGS_KEY, queryFn: roadmapApi.syncSettingsV2, staleTime: 0 });
      return roadmapApi.saveSyncSettingsV2({ ...latest, ...value });
    },
    onSuccess: async (saved) => {
      queryClient.setQueryData(SETTINGS_KEY, saved);
      setDraft(pick(saved, keys));
      setNotice('Сохранено.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'integration', 'azure-devops'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'write-back-overview'] }),
        queryClient.invalidateQueries({ queryKey: ['roadmap', 'plan'] }),
      ]);
    },
  });

  const dirty = Boolean(server && draft && JSON.stringify(server) !== JSON.stringify(draft));
  const update = (patch: Partial<Pick<SyncSettingsV2, K>>) => {
    setNotice(null);
    if (saveMutation.isError) saveMutation.reset();
    setDraft((current) => current ? { ...current, ...patch } : current);
  };

  return {
    query,
    draft,
    dirty,
    notice,
    update,
    reset: (value: Pick<SyncSettingsV2, K>) => { setNotice(null); setDraft(value); },
    save: () => { if (draft) saveMutation.mutate(draft); },
    saving: saveMutation.isPending,
    saveError: saveMutation.error,
    /** Whole settings as last loaded, for sections that need values outside their own keys. */
    full: query.data,
  };
}

/** Azure fields of the chosen project; the list only fills the pickers, so a failed load never blocks editing. */
export function useAzureFields(overview: RoadmapWriteBackOverview | undefined, workItemType: string | undefined) {
  const projects = overview?.projects ?? [];
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const projectId = projects.find((project) => project.id === selectedProjectId)?.id ?? projects[0]?.id ?? '';
  const type = workItemType?.trim() ?? '';
  const query = useQuery({
    queryKey: ['roadmap', 'azure-fields', projectId, type],
    queryFn: () => roadmapApi.azureFields(projectId, type),
    enabled: Boolean(projectId && type),
  });
  const fields: RoadmapAzureField[] = query.data ?? [];
  return { projects, projectId, setProjectId: setSelectedProjectId, fields, query };
}
