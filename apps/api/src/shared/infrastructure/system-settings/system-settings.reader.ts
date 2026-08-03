import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SystemSettingKeys } from './system-setting.keys';

export interface AdminSettingsView {
  slaAutoEscalationEnabled: boolean;
}

@Injectable()
export class SystemSettingsReader {
  constructor(private readonly prisma: PrismaService) {}

  async getAdminSettings(): Promise<AdminSettingsView> {
    return {
      slaAutoEscalationEnabled: await this.isSlaAutoEscalationEnabled(),
    };
  }

  async isSlaAutoEscalationEnabled(): Promise<boolean> {
    const row = await this.prisma.systemSetting.findUnique({
      where: { key: SystemSettingKeys.SLA_AUTO_ESCALATION_ENABLED },
    });

    if (!row) {
      return true;
    }

    return row.value === true;
  }

  async setSlaAutoEscalationEnabled(enabled: boolean): Promise<void> {
    await this.prisma.systemSetting.upsert({
      where: { key: SystemSettingKeys.SLA_AUTO_ESCALATION_ENABLED },
      create: {
        key: SystemSettingKeys.SLA_AUTO_ESCALATION_ENABLED,
        value: enabled,
      },
      update: { value: enabled },
    });
  }
}
