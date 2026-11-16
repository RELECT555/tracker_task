import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ArrayUnique,
  IsArray,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AdminRoleGuard } from '../admin/presentation/guards/admin-role.guard';
import { RoadmapPeopleService } from './roadmap-people.service';
import { RoadmapRolesService } from './roadmap-roles.service';

class RoleMemberAllocationDto {
  @IsString() @MinLength(1) personExternalId!: string;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  allocationPercent!: number;
}

class AssignRoadmapRoleDto {
  @IsOptional() @IsString() @MinLength(1) personExternalId?: string | null;
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  personExternalIds?: string[];
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RoleMemberAllocationDto)
  memberAllocations?: RoleMemberAllocationDto[];
}

class CreateRoadmapRoleDto {
  @IsString() projectId!: string;
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsOptional() @IsString() color?: string;
}

class CreateRoadmapRoleTemplateDto extends AssignRoadmapRoleDto {
  @IsOptional() @IsUUID() projectId?: string;
  @IsString() @MinLength(1) @MaxLength(100) name!: string;
  @IsOptional() @IsString() color?: string;
}

class AddRoadmapRoleFromCatalogDto extends AssignRoadmapRoleDto {
  @IsString() projectId!: string;
  @IsString() templateId!: string;
}

class UpdateRoadmapRoleDto extends AssignRoadmapRoleDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(100) name?: string;
  @IsOptional() @IsString() color?: string;
}

class RoadmapAdminRolesQuery {
  @IsOptional() @IsUUID() projectId?: string;
}

class RoadmapPersonAvatarParams {
  @IsString() @MinLength(1) @MaxLength(255) id!: string;
}

class SetRoleMembersDto {
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  personExternalIds!: string[];
}

class SetRoleDefaultPersonDto {
  @IsOptional() @IsString() personExternalId?: string | null;
}

@Controller('roadmap/admin')
@UseGuards(AdminRoleGuard)
export class RoadmapAdminController {
  constructor(
    private readonly peopleService: RoadmapPeopleService,
    private readonly rolesService: RoadmapRolesService,
  ) {}

  @Get('users')
  users() {
    return this.peopleService.adminPeople();
  }

  @Get('users/:id/avatar')
  @Header('Cache-Control', 'private, no-store')
  userAvatar(@Param() { id }: RoadmapPersonAvatarParams) {
    return this.peopleService.adminPersonAvatar(id);
  }

  @Post('users/sync')
  syncUsers() {
    return this.peopleService.syncAzurePeople();
  }

  @Get('role-catalog')
  roleCatalog() {
    return this.rolesService.listRoleCatalog();
  }

  @Post('role-catalog')
  createRoleTemplate(@Body() dto: CreateRoadmapRoleTemplateDto) {
    return this.rolesService.createRoleTemplate(dto);
  }

  @Delete('role-catalog/:id')
  deleteRoleTemplate(@Param('id') id: string) {
    return this.rolesService.deleteRoleTemplate(id);
  }

  @Post('roles/from-catalog')
  addRoleFromCatalog(@Body() dto: AddRoadmapRoleFromCatalogDto) {
    return this.rolesService.addRoleFromCatalog(
      dto.projectId,
      dto.templateId,
      dto,
    );
  }

  @Get('roles')
  roles(@Query() query: RoadmapAdminRolesQuery) {
    return this.rolesService.listAdminRoles(query.projectId);
  }

  @Post('roles')
  createRole(@Body() dto: CreateRoadmapRoleDto) {
    return this.rolesService.createRole(dto);
  }

  @Patch('roles/:id')
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoadmapRoleDto) {
    return this.rolesService.updateRole(id, dto);
  }

  @Put('roles/:id/members')
  setRoleMembers(@Param('id') id: string, @Body() dto: SetRoleMembersDto) {
    return this.rolesService.setRoleMembers(id, dto.personExternalIds);
  }

  @Put('roles/:id/default-person')
  setRoleDefaultPerson(
    @Param('id') id: string,
    @Body() dto: SetRoleDefaultPersonDto,
  ) {
    return this.rolesService.setRoleDefaultPerson(
      id,
      dto.personExternalId ?? null,
    );
  }

  @Delete('roles/:id')
  deleteRole(@Param('id') id: string) {
    return this.rolesService.deleteRole(id);
  }
}
