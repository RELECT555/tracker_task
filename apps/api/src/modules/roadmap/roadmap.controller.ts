import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, ArrayUnique, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser, type DevUserPayload } from '../../shared/presentation/decorators/current-user.decorator';
import { AdminRoleGuard } from '../admin/presentation/guards/admin-role.guard';
import { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import { RoadmapService } from './roadmap.service';
import { ROADMAP_CREATE_WORK_ITEM_TYPES, RoadmapWorkItemCreateService, type RoadmapWorkItemCreateInput } from './roadmap-work-item-create.service';

class PeriodDto {
  @IsOptional() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) monthKey?: string;
  @IsString() label!: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsNumber() @Min(0) hours!: number;
}

class QuarterMonthDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/) monthKey!: string;
  @IsNumber() @Min(0) hours!: number;
}

class SaveQuarterAllocationDto {
  @IsArray() @ArrayMinSize(3) @ArrayMaxSize(3) @ValidateNested({ each: true }) @Type(() => QuarterMonthDto)
  months!: QuarterMonthDto[];
}

class SaveAllocationDto {
  @IsOptional() @IsString() allocationId?: string;
  @IsString() workItemId!: string;
  @IsString() roleId!: string;
  @IsString() personExternalId!: string;
  @IsString() personName!: string;
  @IsOptional() @IsString() personEmail?: string;
  @Matches(/^\d{4}-Q[1-4]$/) quarterKey!: string;
  @IsNumber() @Min(0) estimatedHours!: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PeriodDto) periods!: PeriodDto[];
}

class RebalanceAllocationsDto {
  @IsArray() @ArrayMinSize(2) @ArrayUnique() @IsUUID('4', { each: true })
  allocationIds!: string[];
}

class PushToAzureDto {
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) allocationIds?: string[];
}

class CreateRoadmapWorkItemDto {
  @IsUUID('4') requestId!: string;
  @IsIn(ROADMAP_CREATE_WORK_ITEM_TYPES) type!: RoadmapWorkItemCreateInput['type'];
  @IsString() @MinLength(1) @MaxLength(255) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @Matches(/^[1-9]\d{0,9}$/) parentExternalId?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) personExternalId?: string;
}

@Controller('roadmap')
export class RoadmapController {
  constructor(
    private readonly roadmap: RoadmapService,
    private readonly azureSync: RoadmapAzureSyncService,
    private readonly workItemCreate: RoadmapWorkItemCreateService,
  ) {}

  @Get('connection')
  connection() {
    return this.roadmap.connectionStatus();
  }

  @Get('projects')
  projects() {
    return this.roadmap.listAzureProjects();
  }

  @Post('projects/:externalId/sync')
  syncProject(@Param('externalId') externalId: string) {
    return this.roadmap.syncProject(externalId);
  }

  @Post('projects/:projectId/azure-push')
  pushProjectToAzure(@CurrentUser() actor: DevUserPayload, @Param('projectId') projectId: string, @Body() dto: PushToAzureDto) {
    return this.azureSync.pushProject(actor.id, projectId, dto.allocationIds);
  }

  @Post('projects/:projectId/work-items')
  @UseGuards(AdminRoleGuard)
  createWorkItemInLocalProject(@Param('projectId', ParseUUIDPipe) projectId: string, @Body() dto: CreateRoadmapWorkItemDto) {
    return this.workItemCreate.createForLocalProject(projectId, dto);
  }

  @Post('azure-projects/:externalId/work-items')
  @UseGuards(AdminRoleGuard)
  createWorkItem(@Param('externalId', ParseUUIDPipe) externalId: string, @Body() dto: CreateRoadmapWorkItemDto) {
    return this.workItemCreate.create(externalId, dto);
  }

  @Get('projects/:projectId/azure-push/preview')
  previewProjectPush(@CurrentUser() actor: DevUserPayload, @Param('projectId') projectId: string) {
    return this.azureSync.previewProject(actor.id, projectId);
  }

  @Get('projects/:projectId/plan')
  projectPlan(@CurrentUser() actor: DevUserPayload, @Param('projectId') projectId: string) {
    return this.roadmap.getProjectPlan(projectId, actor.id);
  }

  @Get('projects/:projectId/fact')
  projectFact(@Param('projectId') projectId: string, @Query('monthKey') monthKey?: string) {
    return this.roadmap.getProjectFact(projectId, monthKey);
  }

  @Get('people')
  people() {
    return this.roadmap.listAzurePeople();
  }

  @Get('roles')
  roles(@Query('projectId') projectId: string) {
    return this.roadmap.listRoles(projectId);
  }

  @Put('allocations')
  saveAllocation(@Body() dto: SaveAllocationDto) {
    return this.roadmap.saveAllocation(dto);
  }

  @Put('allocations/rebalance')
  rebalanceAllocations(@Body() dto: RebalanceAllocationsDto) {
    return this.roadmap.rebalanceAllocations(dto.allocationIds);
  }

  @Post('allocations/:allocationId/azure-push')
  pushAllocationToAzure(@CurrentUser() actor: DevUserPayload, @Param('allocationId') allocationId: string) {
    return this.azureSync.pushAllocation(actor.id, allocationId);
  }

  @Put('allocations/:allocationId/quarters/:quarterKey')
  saveAllocationQuarter(@Param('allocationId') allocationId: string, @Param('quarterKey') quarterKey: string, @Body() dto: SaveQuarterAllocationDto) {
    return this.roadmap.saveAllocationQuarter(allocationId, quarterKey, dto.months);
  }
}
