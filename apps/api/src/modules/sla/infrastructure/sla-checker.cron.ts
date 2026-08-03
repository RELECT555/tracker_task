import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SystemSettingsReader } from '../../../shared/infrastructure/system-settings/system-settings.reader';
import { SlaEscalationService } from '../application/sla-escalation.service';

@Injectable()
export class SlaCheckerCron {
  private readonly logger = new Logger(SlaCheckerCron.name);
  private running = false;

  constructor(
    private readonly slaEscalation: SlaEscalationService,
    private readonly config: ConfigService,
    private readonly settings: SystemSettingsReader,
  ) {}

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleCron(): Promise<void> {
    if (this.config.get<string>('SLA_CHECK_ENABLED', 'true') !== 'true') {
      return;
    }

    if (!(await this.settings.isSlaAutoEscalationEnabled())) {
      this.logger.debug('SLA auto-escalation disabled in settings, skipping');
      return;
    }

    if (this.running) {
      this.logger.debug('SLA check already running, skipping');
      return;
    }

    this.running = true;
    try {
      await this.slaEscalation.checkAndEscalate();
    } catch (error) {
      this.logger.error(
        `SLA check failed: ${error instanceof Error ? error.message : error}`,
      );
    } finally {
      this.running = false;
    }
  }
}
