import { apiFetch } from '@/shared/api/client';

export interface AgentProposal {
  allocationId: string | null;
  workItemId: string;
  workItemTitle: string;
  roleId: string;
  roleName: string;
  personExternalId: string;
  personName: string;
  quarterKey: string;
  fromHours: number | null;
  toHours: number;
  reason?: string;
}

export interface AgentChatInput {
  projectId: string;
  quarterKey: string;
  prompt: string;
  history: unknown[];
}

export interface AgentChatResult {
  reply: string;
  history: unknown[];
  proposals: AgentProposal[];
}

export interface AgentApplyResult {
  index: number;
  ok: boolean;
  error?: string;
}

export const agentApi = {
  status: () => apiFetch<{ configured: boolean }>('/ai/status'),
  chat: (input: AgentChatInput) =>
    apiFetch<AgentChatResult>('/ai/chat', { method: 'POST', body: JSON.stringify(input) }),
  apply: (projectId: string, proposals: AgentProposal[]) =>
    apiFetch<{ results: AgentApplyResult[] }>('/ai/apply', {
      method: 'POST',
      body: JSON.stringify({
        projectId,
        changes: proposals.map(({ workItemId, roleId, personExternalId, quarterKey, toHours }) => ({
          workItemId,
          roleId,
          personExternalId,
          quarterKey,
          estimatedHours: toHours,
        })),
      }),
    }),
};
