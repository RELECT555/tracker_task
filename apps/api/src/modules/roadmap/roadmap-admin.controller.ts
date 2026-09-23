import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ArrayUnique, IsArray, IsOptional, IsString, MinLength } from 'class-validator';
import { AdminRoleGuard } from '../admin/presentation/guards/admin-role.guard';
import { RoadmapService } from './roadmap.service';

class CreateRoadmapRoleDto {
  @IsString() projectId!: string;
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() color?: string;
}

class CreateRoadmapRoleTemplateDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() color?: string;
}

class AddRoadmapRoleFromCatalogDto {
  @IsString() projectId!: string;
  @IsString() templateId!: string;
}

class UpdateRoadmapRoleDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() color?: string;
}

class SetRoleMembersDto {
  @IsArray() @ArrayUnique() @IsString({ each: true }) personExternalIds!: string[];
}

class SetRoleDefaultPersonDto {
  @IsOptional() @IsString() personExternalId?: string | null;
}

@Controller('roadmap/admin')
@UseGuards(AdminRoleGuard)
export class RoadmapAdminController {
  constructor(private readonly roadmap: RoadmapService) {}

  @Get('users')
  users() {
    return this.roadmap.adminPeople();
  }

  @Post('users/sync')
  syncUsers() {
    return this.roadmap.syncAzurePeople();
  }

  @Get('role-catalog')
  roleCatalog() {
    return this.roadmap.listRoleCatalog();
  }

  @Post('role-catalog')
  createRoleTemplate(@Body() dto: CreateRoadmapRoleTemplateDto) {
    return this.roadmap.createRoleTemplate(dto);
  }

  @Post('roles/from-catalog')
  addRoleFromCatalog(@Body() dto: AddRoadmapRoleFromCatalogDto) {
    return this.roadmap.addRoleFromCatalog(dto.projectId, dto.templateId);
  }

  @Get('roles')
  roles(@Query('projectId') projectId: string) {
    return this.roadmap.listRoles(projectId);
  }

  @Post('roles')
  createRole(@Body() dto: CreateRoadmapRoleDto) {
    return this.roadmap.createRole(dto);
  }

  @Patch('roles/:id')
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoadmapRoleDto) {
    return this.roadmap.updateRole(id, dto);
  }

  @Put('roles/:id/members')
  setRoleMembers(@Param('id') id: string, @Body() dto: SetRoleMembersDto) {
    return this.roadmap.setRoleMembers(id, dto.personExternalIds);
  }

  @Put('roles/:id/default-person')
  setRoleDefaultPerson(@Param('id') id: string, @Body() dto: SetRoleDefaultPersonDto) {
    return this.roadmap.setRoleDefaultPerson(id, dto.personExternalId ?? null);
  }

  @Delete('roles/:id')
  deleteRole(@Param('id') id: string) {
    return this.roadmap.deleteRole(id);
  }
}
