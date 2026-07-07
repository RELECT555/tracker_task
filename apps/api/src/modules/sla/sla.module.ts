import { Module } from '@nestjs/common';
import { RequestModule } from '../request/request.module';
import { SlaEscalationService } from './application/sla-escalation.service';
import { SlaCheckerCron } from './infrastructure/sla-checker.cron';

@Module({
  imports: [RequestModule],
  providers: [SlaEscalationService, SlaCheckerCron],
})
export class SlaModule {}
