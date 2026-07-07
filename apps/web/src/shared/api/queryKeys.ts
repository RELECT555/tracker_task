export const queryKeys = {
  requests: {
    outbox: (status?: string) => ['requests', 'outbox', status ?? 'all'] as const,
    detail: (id: string) => ['requests', id] as const,
  },
  requestTypes: {
    all: ['requestTypes'] as const,
  },
};
