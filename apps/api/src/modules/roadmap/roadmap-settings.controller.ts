import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { AdminRoleGuard } from '../admin/presentation/guards/admin-role.guard';
import { RoadmapAzureSyncStatusService } from './roadmap-azure-sync-status.service';
import { RoadmapAzureProcessService } from './roadmap-azure-process.service';
import { RoadmapIntegrationService } from './roadmap-integration.service';
import { RoadmapWorkItemImportService } from './roadmap-work-item-import.service';

class SaveAzureDevOpsSettingsDto {
  @IsString() @MinLength(8) organizationUrl!: string;
  @IsOptional() @IsString() pat?: string;
}

class WriteBackFieldsDto {
  @IsBoolean() assignedTo!: boolean;
  @IsBoolean() originalEstimate!: boolean;
  @IsBoolean() remainingWork!: boolean;
  @IsBoolean() iteration!: boolean;
  @IsBoolean() areaPath!: boolean;
  @IsBoolean() description!: boolean;
}

class SaveWriteBackSettingsDto {
  @IsIn(['off', 'manual', 'auto']) mode!: 'off' | 'manual' | 'auto';
  @IsString() @MinLength(1) @MaxLength(64) workItemType!: string;
  @IsString() @MinLength(1) @MaxLength(200) titleTemplate!: string;
  @IsString() @MaxLength(200) tagsTemplate!: string;
  @ValidateNested() @Type(() => WriteBackFieldsDto) fields!: WriteBackFieldsDto;
  @IsIn(['recalculate', 'create-only']) remainingWorkPolicy!:
    'recalculate' | 'create-only';
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  projectIds!: string[] | null;
}

class TestAzureDevOpsSettingsDto {
  @IsOptional() @IsString() organizationUrl?: string;
  @IsOptional() @IsString() pat?: string;
}

@Controller('roadmap/settings')
@UseGuards(AdminRoleGuard)
export class RoadmapSettingsController {
  constructor(
    private readonly integration: RoadmapIntegrationService,
    private readonly syncStatus: RoadmapAzureSyncStatusService,
    private readonly azureProcess: RoadmapAzureProcessService,
    private readonly importer: RoadmapWorkItemImportService,
  ) {}

  @Get('azure-devops')
  getAzureDevOpsSettings() {
    return this.integration.getPublicSettings();
  }

  @Put('azure-devops')
  saveAzureDevOpsSettings(@Body() dto: SaveAzureDevOpsSettingsDto) {
    return this.integration.saveSettings(dto);
  }

  @Put('azure-devops/write-back')
  saveWriteBackSettings(@Body() dto: SaveWriteBackSettingsDto) {
    return this.integration.saveWriteBackSettings({
      ...dto,
      workItemType: dto.workItemType.trim(),
      projectIds: dto.projectIds ?? null,
    });
  }

  @Get('azure-devops/write-back/v2')
  getWriteBackSettingsV2() {
    return this.integration.getSyncSettings();
  }

  @Put('azure-devops/write-back/v2')
  saveWriteBackSettingsV2(@Body() dto: unknown) {
    return this.integration.saveSyncSettings(dto).then((result) => {
      this.importer.invalidateFieldCatalog();
      return result;
    });
  }

  @Get('azure-devops/write-back/overview')
  writeBackOverview() {
    return this.syncStatus.overview();
  }

  @Get('azure-devops/work-item-types')
  workItemTypes(@Query('projectId') projectId: string) {
    if (!projectId) throw new BadRequestException('Укажите projectId');
    return this.azureProcess.workItemTypes(projectId);
  }

  @Get('azure-devops/fields')
  fields(
    @Query('projectId') projectId: string,
    @Query('workItemType') workItemType: string,
    @Query('refresh') refresh?: string,
  ) {
    if (!projectId || !workItemType)
      throw new BadRequestException('Укажите projectId и workItemType');
    return this.azureProcess.fields(projectId, workItemType, refresh === '1');
  }

  @Get('azure-devops/states')
  states(
    @Query('projectId') projectId: string,
    @Query('workItemType') workItemType: string,
  ) {
    if (!projectId || !workItemType)
      throw new BadRequestException('Укажите projectId и workItemType');
    return this.azureProcess.states(projectId, workItemType);
  }

  @Post('azure-devops/write-back/check/:projectId')
  checkWriteBack(@Param('projectId') projectId: string) {
    return this.syncStatus.checkProject(projectId);
  }

  @Get('azure-devops/webhook-secret')
  getWebhookSecret() {
    return this.integration.getWebhookSecret();
  }

  @Post('azure-devops/webhook-secret/rotate')
  rotateWebhookSecret() {
    return this.integration.getWebhookSecret(true);
  }

  @Post('azure-devops/test')
  testAzureDevOpsConnection(@Body() dto: TestAzureDevOpsSettingsDto) {
    return this.integration.testConnection(dto);
  }
}
