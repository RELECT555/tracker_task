import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Put,
  UseGuards,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsEmail, IsEnum, IsUUID, MaxLength } from 'class-validator';
import { RoadmapProjectRole } from '@prisma/client';
import { AdminRoleGuard } from '../admin/presentation/guards/admin-role.guard';
import { RoadmapProjectAccessService } from './roadmap-project-access.service';

class ProjectAccessEmailDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(255)
  email!: string;
}

class SetProjectAccessDto extends ProjectAccessEmailDto {
  @IsEnum(RoadmapProjectRole)
  role!: RoadmapProjectRole;
}

class ProjectAccessParamsDto extends ProjectAccessEmailDto {
  @IsUUID()
  projectId!: string;
}

@Controller('roadmap/admin/projects')
@UseGuards(AdminRoleGuard)
export class RoadmapProjectAccessController {
  constructor(private readonly access: RoadmapProjectAccessService) {}

  @Get()
  projects() {
    return this.access.localProjects();
  }

  @Get(':projectId/access')
  list(@Param('projectId', ParseUUIDPipe) projectId: string) {
    return this.access.list(projectId);
  }

  @Put(':projectId/access')
  set(
    @Param('projectId', ParseUUIDPipe) projectId: string,
    @Body() { email, role }: SetProjectAccessDto,
  ) {
    return this.access.set(projectId, email, role);
  }

  @Delete(':projectId/access/:email')
  revoke(@Param() { projectId, email }: ProjectAccessParamsDto) {
    return this.access.revoke(projectId, email);
  }
}
