import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ArrayUnique, IsArray, IsOptional, IsString, MinLength } from 'class-validator';
import { AdminRoleGuard } from '../admin/presentation/guards/admin-role.guard';
import { RoadmapService } from './roadmap.service';

class CreateRoadmapRoleDto {
  @IsString() @MinLength(1) name!: string;
  @IsOptional() @IsString() color?: string;
}

class UpdateRoadmapRoleDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() color?: string;
}

class SetRoleMembersDto {
  @IsArray() @ArrayUnique() @IsString({ each: true }) personExternalIds!: string[];
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

  @Get('roles')
  roles() {
    return this.roadmap.listRoles();
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

  @Delete('roles/:id')
  deleteRole(@Param('id') id: string) {
    return this.roadmap.deleteRole(id);
  }
}
