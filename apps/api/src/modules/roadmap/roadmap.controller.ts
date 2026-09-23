import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { IsArray, IsDateString, IsNumber, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { RoadmapService } from './roadmap.service';

class PeriodDto {
  @IsString() label!: string;
  @IsDateString() startsAt!: string;
  @IsDateString() endsAt!: string;
  @IsNumber() @Min(0) hours!: number;
}

class SaveAllocationDto {
  @IsString() workItemId!: string;
  @IsString() roleId!: string;
  @IsString() personExternalId!: string;
  @IsString() personName!: string;
  @IsOptional() @IsString() personEmail?: string;
  @IsNumber() @Min(0) estimatedHours!: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PeriodDto) periods!: PeriodDto[];
}

@Controller('roadmap')
export class RoadmapController {
  constructor(private readonly roadmap: RoadmapService) {}

  @Get('connection')
  connection() {
    return this.roadmap.connectionStatus();
  }

  @Get('projects')
  projects() {
    return this.roadmap.listAzureProjects();
  }

  @Post('projects/:externalId/sync')
  syncProject(@Param('externalId') externalId: string, @Body() body: { name: string; url?: string }) {
    return this.roadmap.syncProject(externalId, body.name, body.url);
  }

  @Get('projects/:projectId/plan')
  projectPlan(@Param('projectId') projectId: string) {
    return this.roadmap.getProjectPlan(projectId);
  }

  @Get('people')
  people() {
    return this.roadmap.listAzurePeople();
  }

  @Get('roles')
  roles() {
    return this.roadmap.listRoles();
  }

  @Put('allocations')
  saveAllocation(@Body() dto: SaveAllocationDto) {
    return this.roadmap.saveAllocation(dto);
  }
}
