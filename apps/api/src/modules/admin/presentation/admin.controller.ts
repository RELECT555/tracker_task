import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ListAuditLogsHandler } from '../../audit/application/queries/list-audit-logs.handler';
import { CreateAdminRequestTypeHandler } from '../application/commands/create-admin-request-type.handler';
import { UpdateAdminRequestTypeHandler } from '../application/commands/update-admin-request-type.handler';
import { CreateAdminRouteTemplateHandler } from '../application/commands/create-admin-route-template.handler';
import { UpdateAdminRouteTemplateHandler } from '../application/commands/update-admin-route-template.handler';
import {
  CreateAdminRouteTemplateVersionHandler,
  PublishAdminRouteTemplateHandler,
} from '../application/commands/publish-admin-route-template.handler';
import { UpdateAdminUserHandler } from '../application/commands/update-admin-user.handler';
import { UpdateAdminSettingsHandler } from '../application/commands/update-admin-settings.handler';
import { ListAdminOrgUnitsHandler } from '../application/queries/list-admin-org-units.handler';
import { ListAdminRolesHandler } from '../application/queries/list-admin-roles.handler';
import { ListAdminUsersHandler } from '../application/queries/list-admin-users.handler';
import { ListAdminRequestTypesHandler } from '../application/queries/list-admin-request-types.handler';
import { ListAdminRouteTemplatesHandler } from '../application/queries/list-admin-route-templates.handler';
import { GetAdminSettingsHandler } from '../application/queries/get-admin-settings.handler';
import {
  CreateAdminRequestTypeDto,
  UpdateAdminRequestTypeDto,
} from './dto/admin-request-type.dto';
import {
  CreateAdminRouteTemplateDto,
  UpdateAdminRouteTemplateDto,
} from './dto/admin-route-template.dto';
import { UpdateAdminSettingsDto } from './dto/admin-settings.dto';
import { UpdateAdminUserDto } from './dto/admin-user.dto';
import { AdminRoleGuard } from './guards/admin-role.guard';
import { CurrentUser } from '../../../shared/presentation/decorators/current-user.decorator';

@Controller('admin')
@UseGuards(AdminRoleGuard)
export class AdminController {
  constructor(
    private readonly listRequestTypesHandler: ListAdminRequestTypesHandler,
    private readonly listRouteTemplatesHandler: ListAdminRouteTemplatesHandler,
    private readonly createRequestTypeHandler: CreateAdminRequestTypeHandler,
    private readonly updateRequestTypeHandler: UpdateAdminRequestTypeHandler,
    private readonly createRouteTemplateHandler: CreateAdminRouteTemplateHandler,
    private readonly updateRouteTemplateHandler: UpdateAdminRouteTemplateHandler,
    private readonly publishRouteTemplateHandler: PublishAdminRouteTemplateHandler,
    private readonly createRouteTemplateVersionHandler: CreateAdminRouteTemplateVersionHandler,
    private readonly listUsersHandler: ListAdminUsersHandler,
    private readonly listRolesHandler: ListAdminRolesHandler,
    private readonly updateUserHandler: UpdateAdminUserHandler,
    private readonly listOrgUnitsHandler: ListAdminOrgUnitsHandler,
    private readonly listAuditLogsHandler: ListAuditLogsHandler,
    private readonly getSettingsHandler: GetAdminSettingsHandler,
    private readonly updateSettingsHandler: UpdateAdminSettingsHandler,
  ) {}

  @Get('request-types')
  listRequestTypes() {
    return this.listRequestTypesHandler.execute();
  }

  @Post('request-types')
  createRequestType(
    @Body() dto: CreateAdminRequestTypeDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.createRequestTypeHandler.execute({ ...dto, actorId: user.id });
  }

  @Patch('request-types/:id')
  updateRequestType(
    @Param('id') id: string,
    @Body() dto: UpdateAdminRequestTypeDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.updateRequestTypeHandler.execute({ id, actorId: user.id, ...dto });
  }

  @Get('route-templates')
  listRouteTemplates() {
    return this.listRouteTemplatesHandler.execute();
  }

  @Post('route-templates')
  createRouteTemplate(
    @Body() dto: CreateAdminRouteTemplateDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.createRouteTemplateHandler.execute({ ...dto, actorId: user.id });
  }

  @Patch('route-templates/:id/versions/:version')
  updateRouteTemplate(
    @Param('id') id: string,
    @Param('version', ParseIntPipe) version: number,
    @Body() dto: UpdateAdminRouteTemplateDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.updateRouteTemplateHandler.execute({
      id,
      version,
      actorId: user.id,
      ...dto,
    });
  }

  @Put('route-templates/:id/publish')
  publishRouteTemplate(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.publishRouteTemplateHandler.execute(id, user.id);
  }

  @Post('route-templates/:id/versions')
  createRouteTemplateVersion(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.createRouteTemplateVersionHandler.execute(id, user.id);
  }

  @Get('users')
  listUsers() {
    return this.listUsersHandler.execute();
  }

  @Patch('users/:id')
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.updateUserHandler.execute({ id, actorId: user.id, ...dto });
  }

  @Get('roles')
  listRoles() {
    return this.listRolesHandler.execute();
  }

  @Get('org-units')
  listOrgUnits() {
    return this.listOrgUnitsHandler.execute();
  }

  @Get('audit-logs')
  async listAuditLogs(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('entityType') entityType?: string,
    @Query('actorId') actorId?: string,
  ) {
    const result = await this.listAuditLogsHandler.execute({
      page,
      limit,
      entityType,
      actorId,
    });

    return {
      data: result.items.map((item: (typeof result.items)[number]) => ({
        ...item,
        createdAt: item.createdAt.toISOString(),
      })),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  @Get('settings')
  getSettings() {
    return this.getSettingsHandler.execute();
  }

  @Patch('settings')
  updateSettings(
    @Body() dto: UpdateAdminSettingsDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.updateSettingsHandler.execute({
      actorId: user.id,
      ...dto,
    });
  }
}
