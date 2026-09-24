import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsNumber, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { RoadmapService } from './roadmap.service';

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
  roles(@Query('projectId') projectId: string) {
    return this.roadmap.listRoles(projectId);
  }

  @Put('allocations')
  saveAllocation(@Body() dto: SaveAllocationDto) {
    return this.roadmap.saveAllocation(dto);
  }

  @Put('allocations/:allocationId/quarters/:quarterKey')
  saveAllocationQuarter(@Param('allocationId') allocationId: string, @Param('quarterKey') quarterKey: string, @Body() dto: SaveQuarterAllocationDto) {
    return this.roadmap.saveAllocationQuarter(allocationId, quarterKey, dto.months);
  }
}
