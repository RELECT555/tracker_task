import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
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
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
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
import { planChangeContext, type PlanChangeQuery } from './roadmap-plan-change';
import { RoadmapPlanChangeService } from './roadmap-plan-change.service';
import { RoadmapAzureSyncStatusService } from './roadmap-azure-sync-status.service';
import { RoadmapAzureProcessService } from './roadmap-azure-process.service';
import { RoadmapAzureFeatureFieldsService } from './roadmap-azure-feature-fields.service';
import { RoadmapService } from './roadmap.service';
import { RoadmapProjectImportService } from './roadmap-project-import.service';
import { RoadmapPeopleService } from './roadmap-people.service';
import { RoadmapRolesService } from './roadmap-roles.service';
import { RoadmapAllocationService } from './roadmap-allocation.service';
import {
  ROADMAP_CREATE_WORK_ITEM_TYPES,
  RoadmapWorkItemCreateService,
  type RoadmapWorkItemCreateInput,
} from './roadmap-work-item-create.service';
import { RoadmapProjectAccessService } from './roadmap-project-access.service';
import { RoadmapWorkItemCardService } from './roadmap-work-item-card.service';
import { RoadmapAllocationAzureService } from './roadmap-allocation-azure.service';

const AZURE_ID = /^[1-9]\d{0,9}$/;

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

class RoleHoursDto {
  @IsNumber() @Min(0) @Max(100000) hours!: number;
  @IsOptional() @Matches(/^(?!0000)\d{4}-Q[1-4]$/) quarterKey?: string;
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
  /** "Назначить": also creates the Azure DevOps Task of the new allocation. */
  @IsOptional() @IsBoolean() createTask?: boolean;
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
  @IsOptional() @IsBoolean() includeQuarterFact?: boolean;
  @IsOptional() @IsBoolean() includeChildEpics?: boolean;
}

/** `?includeChildEpics=1` (or `true`) rolls child epics into their parent epic; anything else keeps them apart. */
function queryFlag(value?: string) {
  return value === '1' || value === 'true';
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

class UpdateWorkItemCardDto {
  @IsNumber() @Min(1) rev!: number;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(255) title?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) state?: string;
  @IsOptional() @IsString() @MaxLength(255) assignedTo?: string | null;
  @IsOptional() @IsString() @MaxLength(32000) description?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  tags?: string[];
}

class WorkItemCommentDto {
  @IsString() @MinLength(1) @MaxLength(10000) text!: string;
}

class LogTimeDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.25) @Max(200) hours!: number;
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}

class PlanChangesQueryDto implements PlanChangeQuery {
  @IsOptional() @IsString() @MaxLength(100) workItemExternalId?: string;
  @IsOptional() @IsString() @MaxLength(255) personExternalId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() @MaxLength(200) cursor?: string;
  /** Not capped here: the service clamps it to 200. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
}

@Controller('roadmap')
export class RoadmapController {
  constructor(
    private readonly roadmap: RoadmapService,
    private readonly azureSync: RoadmapAzureSyncService,
    private readonly workItemCreate: RoadmapWorkItemCreateService,
    private readonly access: RoadmapProjectAccessService,
    private readonly workItemCard: RoadmapWorkItemCardService,
    private readonly allocationAzure: RoadmapAllocationAzureService,
    private readonly projectImport: RoadmapProjectImportService,
    private readonly peopleService: RoadmapPeopleService,
    private readonly rolesService: RoadmapRolesService,
    private readonly allocations: RoadmapAllocationService,
    private readonly syncStatus: RoadmapAzureSyncStatusService,
    private readonly azureProcess: RoadmapAzureProcessService,
    private readonly featureFields: RoadmapAzureFeatureFieldsService,
    private readonly planChanges: RoadmapPlanChangeService,
  ) {}

  @Get('projects/:projectId/changes')
  async projectChanges(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query() query: PlanChangesQueryDto,
  ) {
    await this.access.require(actor, { projectId }, 'read');
    return this.planChanges.list(projectId, query);
  }

  @Get('projects/:projectId/work-items/:externalId/azure')
  async workItemCardView(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('externalId') externalId: string,
  ) {
    const canEdit = await this.access.require(actor, { projectId }, 'read');
    return this.workItemCard.getCard(
      projectId,
      this.azureId(externalId),
      actor.id,
      canEdit,
    );
  }

  @Patch('projects/:projectId/work-items/:externalId/azure')
  async updateWorkItemCard(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('externalId') externalId: string,
    @Body() dto: UpdateWorkItemCardDto,
  ) {
    const canEdit = await this.access.require(actor, { projectId }, 'edit');
    return this.workItemCard.update(
      projectId,
      this.azureId(externalId),
      dto,
      actor,
      canEdit,
    );
  }

  @Post('projects/:projectId/work-items/:externalId/azure/comments')
  async addWorkItemComment(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Param('externalId') externalId: string,
    @Body() dto: WorkItemCommentDto,
  ) {
    const canEdit = await this.access.require(actor, { projectId }, 'edit');
    return this.workItemCard.addComment(
      projectId,
      this.azureId(externalId),
      dto.text,
      actor,
      canEdit,
    );
  }

  private azureId(value: string) {
    if (!AZURE_ID.test(value))
      throw new BadRequestException('Некорректный номер элемента Azure DevOps');
    return value;
  }

  @Get('connection')
  @UseGuards(AdminRoleGuard)
  connection() {
    return this.roadmap.connectionStatus();
  }

  @Get('projects')
  projects(@CurrentUser() actor: AuthenticatedUser) {
    return actor.isAdmin
      ? this.projectImport.listAzureProjects()
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
    return this.projectImport.syncProject(externalId);
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
    return this.syncStatus.previewProject(actor.id, projectId);
  }

  @Get('projects/:projectId/plan')
  async projectPlan(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('includeChildEpics') includeChildEpics?: string,
  ) {
    const canEditPlan = await this.access.require(actor, { projectId }, 'read');
    const plan = await this.roadmap.getProjectPlan(
      projectId,
      actor.id,
      canEditPlan,
      queryFlag(includeChildEpics),
    );
    return { ...plan, canEditPlan };
  }

  /** Azure iteration of a quarter; the plan shows the cards of this iteration. */
  @Get('projects/:projectId/iteration')
  async projectQuarterIteration(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('quarterKey') quarterKey?: string,
  ) {
    await this.access.require(actor, { projectId }, 'read');
    return this.azureProcess.findQuarterIteration(projectId, quarterKey ?? '');
  }

  @Get('projects/:projectId/fact')
  async projectFact(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Query('monthKey') monthKey?: string,
    @Query('includeChildEpics') includeChildEpics?: string,
  ) {
    await this.access.require(actor, { projectId }, 'read');
    return this.roadmap.getProjectFact(
      projectId,
      monthKey,
      queryFlag(includeChildEpics),
    );
  }

  @Get('people')
  @UseGuards(AdminRoleGuard)
  people() {
    return this.peopleService.listAzurePeople();
  }

  @Get('roles')
  async roles(
    @CurrentUser() actor: AuthenticatedUser,
    @Query('projectId', ParseUUIDPipe) projectId: string,
  ) {
    await this.access.require(actor, { projectId }, 'read');
    return this.rolesService.listRoles(projectId);
  }

  @Put('allocations')
  async saveAllocation(
    @CurrentUser() actor: AuthenticatedUser,
    @Body() dto: SaveAllocationDto,
  ) {
    await this.access.require(actor, { workItemId: dto.workItemId }, 'edit');
    const saved = await this.allocations.saveAllocation(
      dto,
      { skipSync: dto.createTask },
      planChangeContext({ id: actor.id, email: actor.email }, 'plan'),
    );
    if (!dto.createTask) return saved;
    // An allocation that already has a Task is simply updated; otherwise its Task is created now.
    if (saved.azureTaskId) await this.azureSync.onAllocationSaved(saved.id);
    else await this.azureSync.createAllocationTask(actor.id, saved.id);
    return saved;
  }

  /** Hours typed into a role cell of a feature go straight to that role's field in Azure DevOps. */
  @Put('work-items/:workItemId/roles/:roleId/hours')
  async setRoleHours(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('workItemId', ParseUUIDPipe) workItemId: string,
    @Param('roleId', ParseUUIDPipe) roleId: string,
    @Body() dto: RoleHoursDto,
  ) {
    await this.access.require(actor, { workItemId }, 'edit');
    return this.azureSync.setRoleHours(
      actor.id,
      workItemId,
      roleId,
      dto.hours,
      dto.quarterKey,
      planChangeContext({ id: actor.id, email: actor.email }, 'plan'),
    );
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
    return this.allocations.rebalanceAllocations(
      dto.allocationIds,
      planChangeContext({ id: actor.id, email: actor.email }, 'plan'),
    );
  }

  @Post('allocations/:allocationId/azure-push')
  async pushAllocationToAzure(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
  ) {
    await this.access.require(actor, { allocationIds: [allocationId] }, 'edit');
    return this.azureSync.pushAllocation(actor.id, allocationId);
  }

  /** Logs time on the allocation's Azure DevOps Task: the assignee or a planner may do it. */
  @Post('allocations/:allocationId/time')
  async logAllocationTime(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
    @Body() dto: LogTimeDto,
  ) {
    const canEdit = await this.access.require(
      actor,
      { allocationIds: [allocationId] },
      'read',
    );
    return this.allocationAzure.logTime(
      actor,
      allocationId,
      dto.hours,
      dto.comment,
      canEdit,
    );
  }

  /** Takes the Task's estimate and assignee from Azure DevOps into the plan. */
  @Post('allocations/:allocationId/azure-accept')
  async acceptAllocationFromAzure(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
  ) {
    await this.access.require(actor, { allocationIds: [allocationId] }, 'edit');
    return this.allocationAzure.acceptFromAzure(
      allocationId,
      planChangeContext({ id: actor.id, email: actor.email }, 'azure'),
    );
  }

  @Delete('allocations/:allocationId')
  async deleteAllocation(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
  ) {
    await this.access.require(actor, { allocationIds: [allocationId] }, 'edit');
    const { workItemId, roleId, ...result } =
      await this.allocationAzure.deleteAllocation(
        actor,
        allocationId,
        planChangeContext({ id: actor.id, email: actor.email }, 'plan'),
      );
    // The deleted hours leave the role field of the feature too, as the Task leaves Azure DevOps.
    await this.featureFields.refreshFeatureField(workItemId, roleId);
    return result;
  }

  /** "Создать задачу": creates the Azure DevOps Task of an allocation; plan edits alone never do. */
  @Post('allocations/:allocationId/azure-task')
  async createAllocationTask(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
  ) {
    await this.access.require(actor, { allocationIds: [allocationId] }, 'edit');
    return this.azureSync.createAllocationTask(actor.id, allocationId);
  }

  @Put('allocations/:allocationId/quarters/:quarterKey')
  async saveAllocationQuarter(
    @CurrentUser() actor: AuthenticatedUser,
    @Param('allocationId', ParseUUIDPipe) allocationId: string,
    @Param('quarterKey') quarterKey: string,
    @Body() dto: SaveQuarterAllocationDto,
  ) {
    await this.access.require(actor, { allocationIds: [allocationId] }, 'edit');
    return this.allocations.saveAllocationQuarter(
      allocationId,
      quarterKey,
      dto.months,
      planChangeContext({ id: actor.id, email: actor.email }, 'plan'),
    );
  }
}
