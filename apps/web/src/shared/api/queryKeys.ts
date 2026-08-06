export const queryKeys = {
  requests: {
    inbox: (scope: 'active' | 'archive' = 'active', sort?: 'sla' | 'recent') =>
      ['requests', 'inbox', scope, sort ?? 'sla'] as const,
    outbox: (status?: string) => ['requests', 'outbox', status ?? 'all'] as const,
    search: (params: Record<string, unknown>) => ['requests', 'search', params] as const,
    detail: (id: string) => ['requests', id] as const,
  },
  requestTypes: {
    all: ['requestTypes'] as const,
  },
  users: {
    directory: () => ['users', 'directory'] as const,
  },
  admin: {
    requestTypes: () => ['admin', 'request-types'] as const,
    routeTemplates: () => ['admin', 'route-templates'] as const,
    users: () => ['admin', 'users'] as const,
    roles: () => ['admin', 'roles'] as const,
    orgUnits: () => ['admin', 'org-units'] as const,
    auditLogs: (entityType?: string) =>
      ['admin', 'audit-logs', entityType ?? 'all'] as const,
    settings: () => ['admin', 'settings'] as const,
  },
};
