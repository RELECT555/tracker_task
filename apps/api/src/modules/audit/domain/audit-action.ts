/** Stable action codes stored in audit_logs.action */
export const AuditActions = {
  USER_UPDATED: 'user.updated',
  REQUEST_TYPE_CREATED: 'request_type.created',
  REQUEST_TYPE_UPDATED: 'request_type.updated',
  ROUTE_TEMPLATE_CREATED: 'route_template.created',
  ROUTE_TEMPLATE_UPDATED: 'route_template.updated',
  ROUTE_TEMPLATE_PUBLISHED: 'route_template.published',
  ROUTE_TEMPLATE_VERSION_CREATED: 'route_template.version_created',
  SETTINGS_UPDATED: 'settings.updated',
} as const;

export type AuditAction = (typeof AuditActions)[keyof typeof AuditActions];

export const AuditEntityTypes = {
  USER: 'user',
  REQUEST_TYPE: 'request_type',
  ROUTE_TEMPLATE: 'route_template',
  SYSTEM_SETTING: 'system_setting',
} as const;

export type AuditEntityType = (typeof AuditEntityTypes)[keyof typeof AuditEntityTypes];
