import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  ArrayUnique,
  IsBoolean,
  IsDateString,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import type { RoadmapPortfolioInput } from '@tracker/shared';
import { Type } from 'class-transformer';
import {
  CurrentUser,
  type AuthenticatedUser,
} from '../../shared/presentation/decorators/current-user.decorator';
import { AdminRoleGuard } from '../admin/presentation/guards/admin-role.guard';
import { RoadmapAzureSyncService } from './roadmap-azure-sync.service';
import { RoadmapService } from './roadmap.service';
import {
  ROADMAP_CREATE_WORK_ITEM_TYPES,
  RoadmapWorkItemCreateService,
  type RoadmapWorkItemCreateInput,
} from './roadmap-work-item-create.service';
import { RoadmapProjectAccessService } from './roadmap-project-access.service';

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
  @IsArray()
  @ArrayMinSize(3)
  @ArrayMaxSize(3)
  @ValidateNested({ each: true })
  @Type(() => QuarterMonthDto)
  months!: QuarterMonthDto[];
}

class SaveAllocationDto {
  @IsOptional() @IsUUID() allocationId?: string;
  @IsUUID() workItemId!: string;
  @IsUUID() roleId!: string;
  @IsString() personExternalId!: string;
  @IsString() personName!: string;
  @IsOptional() @IsString() personEmail?: string;
  @Matches(/^\d{4}-Q[1-4]$/) quarterKey!: string;
  @IsNumber() @Min(0) estimatedHours!: number;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PeriodDto)
  periods!: PeriodDto[];
}

class RebalanceAllocationsDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  allocationIds!: string[];
}

class PushToAzureDto {
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  allocationIds?: string[];
}

class PortfolioDto implements RoadmapPortfolioInput {
  @IsArray()
  @ArrayUnique()
  @IsUUID('all', { each: true })
  projectIds!: string[];
  @Matches(/^(?!0000)\d{4}-Q[1-4]$/) quarterKey!: string;
  @IsOptional() @Matches(/^(?!0000)\d{4}-(0[1-9]|1[0-2])$/) monthKey?: string;
  @IsOptional() @IsBoolean() plannedRolesOnly?: boolean;
  @IsOptional() @IsBoolean() includeMonthlyFact?: boolean;
}

class CreateRoadmapWorkItemDto {
  @IsUUID('4') requestId!: string;
  @IsIn(ROADMAP_CREATE_WORK_ITEM_TYPES)
  type!: RoadmapWorkItemCreateInput['type'];
  @IsString() @MinLength(1) @MaxLength(255) title!: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsOptional() @Matches(/^[1-9]\d{0,9}$/) parentExternalId?: string;
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  personExternalId?: string;
}

@Controller('roadmap')
export class RoadmapController {
  constructor(
    private readonly roadmap: RoadmapService,
    private readonly azureSync: RoadmapAzureSyncService,
    private readonly workItemCreate: RoadmapWorkItemCreateService,
    private readonly access: RoadmapProjectAccessService,
  ) {}

  @Get('connection')
  @UseGuards(AdminRoleGuard)
  connection() {
    return this.roadmap.connectionStatus();
  }

  @Get('projects')
  projects(@CurrentUser() actor: AuthenticatedUser) {
    return actor.isAdmin
      ? this.roadmap.listAzureProjects()
      : this.access.localProjects(actor.email);
  }

  @Get('projects/local')
  localProjects(@CurrentUser() actor: AuthenticatedUser) {
    return this.access.localProjects(actor.isAdmin ? undefined : actor.email);
  }

  @Post('projects/summary')
  @HttpCode(200)
  projectSummaries(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() input: PortfolioDto,
  ) {
    return this.roadmap.getProjectSummaries(
      input,
      actor.isAdmin ? undefined : actor.email,
    );
  }

  @Post('projects/:externalId/sync')
  @UseGuards(AdminRoleGuard)
  syncProject(@Param('externalId') externalId: string) {
    return this.roadmap.syncProject(externalId);
  }

  @Post('projects/:projectId/azure-push')
  async pushProjectToAzure(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: PushToAzureDto,
  ) {
    await this.access.require(actor, { projectId }, 'edit');
    return this.azureSync.pushProject(actor.id, projectId, dto.allocationIds);
  }

  @Post('projects/:projectId/work-items')
  @UseGuards(AdminRoleGuard)
  createWorkItemInLocalProject(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() dto: CreateRoadmapWorkItemDto,
  ) {
    return this.workItemCreate.createForLocalProject(projectId, dto);
  }

  @Post('azure-projects/:externalId/work-items')
  @UseGuards(AdminRoleGuard)
  createWorkItem(
    @Param('externalId', ParseUUIDPipe) externalId: string,
    @Body() dto: CreateRoadmapWorkItemDto,
  ) {
    return this.workItemCreate.create(externalId, dto);
  }

  @Get('projects/:projectId/azure-push/preview')
  async previewProjectPush(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    await this.access.require(actor, { projectId }, 'edit');
    return this.azureSync.previewProject(actor.id, projectId);
  }

  @Get('projects/:projectId/plan')
  async projectPlan(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
  ) {
    const canEditPlan = await this.access.require(actor, { projectId }, 'read');
    const plan = await this.roadmap.getProjectPlan(
      projectId,
      actor.id,
      canEditPlan,
    );
    return { ...plan, canEditPlan };
  }

  @Get('projects/:projectId/fact')
  async projectFact(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('monthKey') monthKey?: string,
  ) {
    await this.access.require(actor, { projectId }, 'read');
    return this.roadmap.getProjectFact(projectId, monthKey);
  }

  @Get('people')
  @UseGuards(AdminRoleGuard)
  people() {
    return this.roadmap.listAzurePeople();
  }

  @Get('roles')
  async roles(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('projectId', ParseUUIDPipe) projectId: string,
  ) {
    await this.access.require(actor, { projectId }, 'read');
    return this.roadmap.listRoles(projectId);
  }

  @Put('allocations')
  async saveAllocation(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SaveAllocationDto,
  ) {
    await this.access.require(actor, { workItemId: dto.workItemId }, 'edit');
    return this.roadmap.saveAllocation(dto);
  }

  @Put('allocations/rebalance')
  async rebalanceAllocations(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: RebalanceAllocationsDto,
  ) {
    await this.access.require(
      actor,
      { allocationIds: dto.allocationIds },
      'edit',
    );
    return this.roadmap.rebalanceAllocations(dto.allocationIds);
  }

  @Post('allocations/:allocationId/azure-push')
  async pushAllocationToAzure(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
  ) {
    await this.access.require(actor, { allocationIds: [allocationId] }, 'edit');
    return this.azureSync.pushAllocation(actor.id, allocationId);
  }

  @Put('allocations/:allocationId/quarters/:quarterKey')
  async saveAllocationQuarter(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
    @Param('quarterKey') quarterKey: string,
    @Body() dto: SaveQuarterAllocationDto,
  ) {
    await this.access.require(actor, { allocationIds: [allocationId] }, 'edit');
    return this.roadmap.saveAllocationQuarter(
      allocationId,
      quarterKey,
      dto.months,
    );
  }
}
