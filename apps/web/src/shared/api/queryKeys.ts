export const queryKeys = {
  requests: {
    inbox: (sort?: 'sla' | 'recent') => ['requests', 'inbox', sort ?? 'sla'] as const,
    outbox: (status?: string) => ['requests', 'outbox', status ?? 'all'] as const,
    detail: (id: string) => ['requests', id] as const,
  },
  requestTypes: {
    all: ['requestTypes'] as const,
  },
  admin: {
    requestTypes: () => ['admin', 'request-types'] as const,
    routeTemplates: () => ['admin', 'route-templates'] as const,
    users: () => ['admin', 'users'] as const,
    roles: () => ['admin', 'roles'] as const,
    orgUnits: () => ['admin', 'org-units'] as const,
  },
};
