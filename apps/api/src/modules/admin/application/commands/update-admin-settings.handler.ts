import { Injectable } from '@nestjs/common';
import { SystemSettingsReader } from '../../../../shared/infrastructure/system-settings/system-settings.reader';
import { SYSTEM_SETTINGS_AUDIT_ENTITY_ID } from '../../../../shared/infrastructure/system-settings/system-setting.keys';
import { AuditRecorder } from '../../../audit/application/audit-recorder';
import { AuditActions, AuditEntityTypes } from '../../../audit/domain/audit-action';

export interface UpdateAdminSettingsCommand {
  actorId: string;
  slaAutoEscalationEnabled?: boolean;
}

@Injectable()
export class UpdateAdminSettingsHandler {
  constructor(
    private readonly settings: SystemSettingsReader,
    private readonly audit: AuditRecorder,
  ) {}

  async execute(command: UpdateAdminSettingsCommand) {
    const before = await this.settings.getAdminSettings();
    const next = {
      slaAutoEscalationEnabled:
        command.slaAutoEscalationEnabled ?? before.slaAutoEscalationEnabled,
    };

    if (next.slaAutoEscalationEnabled !== before.slaAutoEscalationEnabled) {
      await this.settings.setSlaAutoEscalationEnabled(next.slaAutoEscalationEnabled);

      await this.audit.record({
        actorId: command.actorId,
        action: AuditActions.SETTINGS_UPDATED,
        entityType: AuditEntityTypes.SYSTEM_SETTING,
        entityId: SYSTEM_SETTINGS_AUDIT_ENTITY_ID,
        payload: {
          changes: {
            slaAutoEscalationEnabled: {
              from: before.slaAutoEscalationEnabled,
              to: next.slaAutoEscalationEnabled,
            },
          },
        },
      });
    }

    return next;
  }
}
