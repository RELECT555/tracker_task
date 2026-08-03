export const SystemSettingKeys = {
  SLA_AUTO_ESCALATION_ENABLED: 'sla.auto_escalation_enabled',
} as const;

/** Well-known UUID for audit_logs.entity_id (system settings are key-value, not UUID rows). */
export const SYSTEM_SETTINGS_AUDIT_ENTITY_ID =
  '00000000-0000-4000-8000-0000000000a1';
