import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import {
  RoadmapAzureWebhookService,
  type AzureWebhookPayload,
} from './roadmap-azure-webhook.service';
import {
  AZURE_WEBHOOK_SECRET_HEADER,
  RoadmapIntegrationService,
} from './roadmap-integration.service';

/** Receives Azure DevOps service hook events (work item created/updated/deleted/restored). */
@Controller('roadmap/webhooks')
export class RoadmapWebhookController {
  constructor(
    private readonly integration: RoadmapIntegrationService,
    private readonly webhooks: RoadmapAzureWebhookService,
  ) {}

  @Post('azure-devops')
  @HttpCode(202)
  async azureDevOps(
    @Headers(AZURE_WEBHOOK_SECRET_HEADER) secret: string | undefined,
    @Body() payload: AzureWebhookPayload,
  ) {
    if (!(await this.integration.verifyWebhookSecret(secret))) {
      throw new UnauthorizedException('Invalid Roadmap webhook secret');
    }
    return this.webhooks.handleWebhook(payload);
  }
}
