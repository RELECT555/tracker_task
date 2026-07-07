export const routes = {
  home: '/',
  inbox: '/inbox',
  outbox: '/outbox',
  newRequest: '/requests/new',
  request: (id: string) => `/requests/${id}`,
  admin: {
    root: '/admin',
    routeTemplates: '/admin/route-templates',
    requestTypes: '/admin/request-types',
    users: '/admin/users',
    orgUnits: '/admin/org-units',
  },
  login: '/login',
} as const;
