export const queryKeys = {
  requests: {
    inbox: () => ['requests', 'inbox'] as const,
    outbox: (status?: string) => ['requests', 'outbox', status ?? 'all'] as const,
    detail: (id: string) => ['requests', id] as const,
  },
  requestTypes: {
    all: ['requestTypes'] as const,
  },
};
