import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { IsOptional, IsString, MinLength } from 'class-validator';
import { AdminRoleGuard } from '../admin/presentation/guards/admin-role.guard';
import { RoadmapIntegrationService } from './roadmap-integration.service';

class SaveAzureDevOpsSettingsDto {
  @IsString() @MinLength(8) organizationUrl!: string;
  @IsOptional() @IsString() pat?: string;
}

class TestAzureDevOpsSettingsDto {
  @IsOptional() @IsString() organizationUrl?: string;
  @IsOptional() @IsString() pat?: string;
}

@Controller('roadmap/settings')
@UseGuards(AdminRoleGuard)
export class RoadmapSettingsController {
  constructor(private readonly integration: RoadmapIntegrationService) {}

  @Get('azure-devops')
  getAzureDevOpsSettings() {
    return this.integration.getPublicSettings();
  }

  @Put('azure-devops')
  saveAzureDevOpsSettings(@Body() dto: SaveAzureDevOpsSettingsDto) {
    return this.integration.saveSettings(dto);
  }

  @Post('azure-devops/test')
  testAzureDevOpsConnection(@Body() dto: TestAzureDevOpsSettingsDto) {
    return this.integration.testConnection(dto);
  }
}
